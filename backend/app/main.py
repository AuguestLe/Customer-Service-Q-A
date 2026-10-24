import asyncio
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from uuid import uuid4

import httpx
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, StreamingResponse
from starlette.middleware.trustedhost import TrustedHostMiddleware

from .config import Settings
from .schemas import MAX_INPUT_CHARS, ChatRequest
from .streaming import (
    ProviderError,
    deepseek_events,
    disconnect_aware,
    encode_event,
    mock_events,
)

logger = logging.getLogger("chat.api")


def create_app(
    settings: Settings | None = None, transport: httpx.AsyncBaseTransport | None = None
) -> FastAPI:
    settings = settings or Settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(settings.upstream_timeout_seconds, connect=10),
            follow_redirects=False,
            transport=transport,
            trust_env=False,
        ) as client:
            app.state.client = client
            yield

    api = FastAPI(title="问一问 · Chat API", version="0.1.0", lifespan=lifespan)
    # Local-only first milestone. Do not weaken this to publish without adding authentication.
    api.add_middleware(
        TrustedHostMiddleware, allowed_hosts=["localhost", "127.0.0.1", "[::1]", "testserver"]
    )

    @api.exception_handler(RequestValidationError)
    async def invalid_request(_request: Request, _exc: RequestValidationError):
        # Avoid echoing invalid user messages (or accidentally submitted secrets) in errors.
        return JSONResponse(
            status_code=422,
            content={
                "code": "INVALID_REQUEST",
                "message": "问题或上下文格式不正确，请缩短内容后重试。",
            },
        )

    @api.get("/api/health")
    async def health():
        return {"status": "ok"}

    @api.get("/api/config")
    async def config():
        return {
            "mode": settings.chat_mode,
            "configured": settings.configured,
            "model": settings.deepseek_model if settings.chat_mode == "deepseek" else "mock",
            "max_input_chars": MAX_INPUT_CHARS,
        }

    @api.post("/api/chat/stream", response_model=None)
    async def chat(body: ChatRequest, request: Request):
        if not settings.configured:
            return JSONResponse(
                status_code=503,
                content={
                    "code": "NOT_CONFIGURED",
                    "message": "尚未配置 DeepSeek，请在后端填写 API Key 后重启服务。",
                },
            )
        trace_id = uuid4().hex

        async def events() -> AsyncIterator[str]:
            try:
                source = (
                    mock_events(body)
                    if settings.chat_mode == "mock"
                    else deepseek_events(request.app.state.client, settings, body)
                )
                async for event in source:
                    yield event
            except asyncio.CancelledError:
                raise
            except ProviderError as exc:
                logger.warning("generation_error trace=%s code=%s", trace_id, exc.code)
                yield encode_event(
                    "error", {"code": exc.code, "message": exc.safe_message, "trace_id": trace_id}
                )
            except (TimeoutError, httpx.TimeoutException):
                yield encode_event(
                    "error",
                    {
                        "code": "MODEL_TIMEOUT",
                        "message": "等待模型超时，请稍后重试。",
                        "trace_id": trace_id,
                    },
                )
            except httpx.HTTPError:
                yield encode_event(
                    "error",
                    {
                        "code": "MODEL_NETWORK",
                        "message": "暂时无法连接模型服务，请稍后重试。",
                        "trace_id": trace_id,
                    },
                )
            except Exception:
                # Never return provider payloads, keys or a stack trace to the browser.
                logger.error("generation_error trace=%s code=INTERNAL_ERROR", trace_id)
                yield encode_event(
                    "error",
                    {
                        "code": "INTERNAL_ERROR",
                        "message": "服务暂时异常，请重试。",
                        "trace_id": trace_id,
                    },
                )

        return StreamingResponse(
            disconnect_aware(events(), request),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache, no-store",
                "X-Accel-Buffering": "no",
                "X-Content-Type-Options": "nosniff",
                "X-Trace-Id": trace_id,
            },
        )

    return api


app = create_app()
