import asyncio
import json
from collections.abc import AsyncIterator
from contextlib import suppress
from typing import Any

import httpx
from anyio import CancelScope
from starlette.requests import Request

from .config import Settings
from .schemas import ChatRequest

SYSTEM_PROMPT = (
    "你是一个友好、简洁的中文通用咨询助手。直接回答用户的普通问题，按需解释概念或协助写作。"
    "没有连接企业知识库、订单系统、实时搜索或任何业务工具；不要声称能查询内部数据或执行操作。"
    "不确定的信息请明确说明。不得要求用户提供密码、API 密钥等敏感凭据。"
)


class ProviderError(Exception):
    def __init__(self, code: str, message: str):
        self.code = code
        self.safe_message = message
        super().__init__(code)


def encode_event(event: str, payload: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"


async def iter_sse_data(response: httpx.Response) -> AsyncIterator[str]:
    """Parse event boundaries, comments, CRLF and multiline data, not TCP chunks."""
    lines: list[str] = []
    size = 0
    async for line in response.aiter_lines():
        if not line:
            if lines:
                yield "\n".join(lines)
            lines = []
            size = 0
        elif line.startswith("data:"):
            data = line[5:]
            data = data[1:] if data.startswith(" ") else data
            size += len(data)
            if size > 1_000_000:
                raise ProviderError("INVALID_STREAM", "模型响应格式异常，请重试。")
            lines.append(data)
    # An unterminated frame is not treated as a completed event.


def status_error(status: int) -> ProviderError:
    if status in {401, 403}:
        return ProviderError("MODEL_AUTH", "模型认证失败，请检查后端 API Key 和模型访问权限。")
    if status == 402:
        return ProviderError("MODEL_BALANCE", "模型账户额度不足，请检查账户余额。")
    if status == 429:
        return ProviderError("MODEL_RATE_LIMIT", "模型服务请求过多，请稍后手动重试。")
    if status in {400, 404, 422}:
        return ProviderError("MODEL_CONFIG", "模型参数或型号不可用，请检查后端模型配置。")
    return ProviderError("MODEL_UNAVAILABLE", "模型服务暂时不可用，请稍后重试。")


async def deepseek_events(
    client: httpx.AsyncClient, settings: Settings, body: ChatRequest
) -> AsyncIterator[str]:
    payload = {
        "model": settings.deepseek_model,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            *[message.model_dump() for message in body.messages],
        ],
        "stream": True,
        "max_tokens": settings.max_output_tokens,
        "reasoning_effort": settings.deepseek_reasoning_effort,
    }
    headers = {
        "Authorization": f"Bearer {settings.deepseek_api_key.get_secret_value().strip()}",
        "Accept": "text/event-stream",
    }
    # This timeout bounds the entire generation, not only time between chunks.
    async with asyncio.timeout(settings.upstream_timeout_seconds):
        async with client.stream(
            "POST", f"{settings.deepseek_base_url}/chat/completions", json=payload, headers=headers
        ) as response:
            if response.status_code != 200:
                raise status_error(response.status_code)
            if "text/event-stream" not in response.headers.get("content-type", ""):
                raise ProviderError("INVALID_STREAM", "模型未返回预期的流式响应，请检查接口配置。")
            has_content = False
            finish_reason = None
            async for data in iter_sse_data(response):
                if data == "[DONE]":
                    if not has_content:
                        raise ProviderError("EMPTY_REPLY", "模型没有返回有效文字，请重试。")
                    if finish_reason not in {"stop", "length"}:
                        raise ProviderError("INCOMPLETE_REPLY", "回答意外中断，已保留部分内容。")
                    yield encode_event("done", {"finish_reason": finish_reason})
                    return
                try:
                    chunk = json.loads(data)
                    if not isinstance(chunk, dict) or chunk.get("error"):
                        raise ValueError("Unexpected model payload")
                    choices = chunk.get("choices", [])
                    if not isinstance(choices, list):
                        raise ValueError("Invalid choices")
                    if not choices:
                        continue  # optional usage-only chunk
                    choice = choices[0]
                    delta = choice.get("delta", {})
                    text = delta.get("content")
                    reason = choice.get("finish_reason")
                    if text is not None and not isinstance(text, str):
                        raise ValueError("Invalid content")
                except (ValueError, TypeError, AttributeError, IndexError) as exc:
                    raise ProviderError("INVALID_STREAM", "模型响应格式异常，请重试。") from exc
                # reasoning_content and other private provider fields never reach the browser.
                if text:
                    has_content = has_content or bool(text.strip())
                    yield encode_event("delta", {"text": text})
                if reason is not None:
                    if reason not in {"stop", "length"}:
                        raise ProviderError(
                            "MODEL_STOPPED", "模型未能完成回答，可以修改问题后重试。"
                        )
                    finish_reason = reason
            raise ProviderError("INCOMPLETE_REPLY", "连接中断，未完成的回答已保留，请手动重试。")


async def mock_events(body: ChatRequest) -> AsyncIterator[str]:
    question = body.messages[-1].content
    if "API" in question.upper() or "接口" in question:
        answer = (
            "API 可以理解为程序之间约定好的沟通接口。\n\n"
            "比如天气应用通过天气 API 获取温度，再显示给你。这个聊天页的流程是：\n"
            "前端提交问题 → Python 后端调用 DeepSeek → 回答逐段显示。\n\n"
            "你不需要知道模型内部如何运行，只要按约定发送问题、接收结果。"
        )
    elif "邮件" in question:
        answer = (
            "主题：关于项目进度的确认\n\n你好，\n"
            "想和你确认目前的项目进展，以及预计的下一次交付时间。"
            "如果需要我补充资料或协助处理问题，也请告诉我。\n\n"
            "方便的话，期待你今天下班前回复，便于我们安排后续工作。谢谢！"
        )
    else:
        answer = (
            f"收到你的问题：{question[:160]}\n\n"
            "这是用于验证页面交互的预置模拟回复，不是真实 DeepSeek 生成的答案。"
            "你可以尝试停止回答、复制、继续提问或清空对话。\n\n"
            "要获得真实回答，请在 backend/.env 配置密钥，再用 npm run dev 启动。"
        )
    answer += "\n\n（当前为模拟模式，不验证模型理解与事实准确性。）"
    await asyncio.sleep(0.4)
    for offset in range(0, len(answer), 4):
        yield encode_event("delta", {"text": answer[offset : offset + 4]})
        await asyncio.sleep(0.04)
    yield encode_event("done", {"finish_reason": "stop"})


async def disconnect_aware(
    source: AsyncIterator[str], request: Request, heartbeat_seconds: float = 10
) -> AsyncIterator[str]:
    """Cancel a blocked upstream read even if the browser closes before its first token."""

    async def monitor_disconnect() -> None:
        while True:
            message = await request.receive()
            if message["type"] == "http.disconnect":
                return

    monitor = asyncio.create_task(monitor_disconnect())
    pending: asyncio.Task[str] | None = None
    try:
        while True:
            if pending is None:
                pending = asyncio.create_task(anext(source))
            completed, _ = await asyncio.wait(
                {pending, monitor}, timeout=heartbeat_seconds, return_when=asyncio.FIRST_COMPLETED
            )
            if monitor in completed:
                break
            if pending not in completed:
                yield ": keepalive\n\n"
                continue
            try:
                event = pending.result()
            except StopAsyncIteration:
                break
            pending = None
            yield event
    finally:
        # Starlette's level cancellation must not interrupt HTTPX's async close.
        # Shield only finalization; the original cancellation still propagates.
        with CancelScope(shield=True):
            tasks = [monitor] + ([pending] if pending is not None else [])
            for task in tasks:
                task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
            with suppress(RuntimeError):
                await source.aclose()
