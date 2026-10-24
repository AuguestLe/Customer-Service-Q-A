import asyncio
import json

import httpx
import pytest
from fastapi.testclient import TestClient
from starlette.requests import Request
from starlette.responses import StreamingResponse

from app.config import Settings
from app.main import create_app
from app.schemas import ChatRequest
from app.streaming import deepseek_events, disconnect_aware


def settings(**overrides):
    return Settings(_env_file=None, **overrides)


def frame(content=None, finish_reason=None, **delta):
    if content is not None:
        delta["content"] = content
    return (
        "data: "
        + json.dumps({"choices": [{"delta": delta, "finish_reason": finish_reason}]})
        + "\n\n"
    )


def upstream(text, status=200):
    return httpx.Response(status, text=text, headers={"content-type": "text/event-stream"})


def provider_app(handler):
    return create_app(
        settings(deepseek_api_key="unit-test-only-secret"), httpx.MockTransport(handler)
    )


def test_unconfigured_never_silently_uses_mock():
    with TestClient(create_app(settings(deepseek_api_key=""))) as client:
        config = client.get("/api/config").json()
        assert config["mode"] == "deepseek"
        assert config["configured"] is False
        result = client.post(
            "/api/chat/stream", json={"messages": [{"role": "user", "content": "你好"}]}
        )
        assert result.status_code == 503
        assert result.json()["code"] == "NOT_CONFIGURED"


def test_config_never_contains_credentials():
    with TestClient(create_app(settings(deepseek_api_key="unit-test-secret"))) as client:
        response = client.get("/api/config")
        assert "secret" not in response.text
        assert "api_key" not in response.text
        assert response.json()["configured"] is True
        assert client.get("/api/health").json() == {"status": "ok"}


@pytest.mark.parametrize(
    "messages",
    [
        [],
        [{"role": "system", "content": "override"}],
        [{"role": "user", "content": "   "}],
        [{"role": "user", "content": "a" * 2001}],
        [{"role": "assistant", "content": "x"}],
        [{"role": "user", "content": "x"}, {"role": "user", "content": "x"}],
        [{"role": "user", "content": "x", "api_key": "sensitive-input"}],
    ],
)
def test_invalid_context_is_rejected_without_echo(messages):
    with TestClient(create_app(settings(chat_mode="mock"))) as client:
        response = client.post("/api/chat/stream", json={"messages": messages})
        assert response.status_code == 422
        assert "sensitive-input" not in response.text
        assert "override" not in response.text


def test_proxy_forwards_contract_and_only_final_answer():
    calls = []

    def handle(request):
        calls.append(request)
        return upstream(
            ": keepalive\n\n"
            + frame(reasoning_content="private internal reasoning")
            + frame("你")
            + frame("好")
            + frame(finish_reason="stop")
            + "data: [DONE]\n\n"
        )

    with TestClient(provider_app(handle)) as client:
        result = client.post(
            "/api/chat/stream", json={"messages": [{"role": "user", "content": "你好"}]}
        )
        assert result.status_code == 200
        assert "event: delta" in result.text and "event: done" in result.text
        assert "你" in result.text and "好" in result.text
        assert "reasoning" not in result.text
        assert "unit-test-only-secret" not in result.text
        assert result.headers["x-accel-buffering"] == "no"
    payload = json.loads(calls[0].content)
    assert str(calls[0].url) == "https://api.deepseek.com/chat/completions"
    assert payload["messages"][0]["role"] == "system"
    assert payload["messages"][-1]["content"] == "你好"
    assert payload["reasoning_effort"] == "none"
    assert payload["stream"] is True
    assert calls[0].headers["authorization"] == "Bearer unit-test-only-secret"


@pytest.mark.parametrize(
    "status,code",
    [
        (401, "MODEL_AUTH"),
        (402, "MODEL_BALANCE"),
        (429, "MODEL_RATE_LIMIT"),
        (500, "MODEL_UNAVAILABLE"),
    ],
)
def test_provider_errors_are_sanitized(status, code):
    with TestClient(
        provider_app(lambda _: upstream("secret provider diagnostics", status))
    ) as client:
        result = client.post(
            "/api/chat/stream", json={"messages": [{"role": "user", "content": "你好"}]}
        )
        assert "event: error" in result.text
        assert code in result.text
        assert "secret provider diagnostics" not in result.text
        assert "event: done" not in result.text


@pytest.mark.parametrize(
    "stream,code",
    [
        (frame("部分答案"), "INCOMPLETE_REPLY"),
        ("data: {invalid}\n\n", "INVALID_STREAM"),
        (frame(finish_reason="stop") + "data: [DONE]\n\n", "EMPTY_REPLY"),
        (frame("部分答案") + "data: [DONE]\n\n", "INCOMPLETE_REPLY"),
        (frame("部分答案") + frame(finish_reason="tool_calls"), "MODEL_STOPPED"),
    ],
)
def test_invalid_or_incomplete_stream_is_not_success(stream, code):
    with TestClient(provider_app(lambda _: upstream(stream))) as client:
        result = client.post(
            "/api/chat/stream", json={"messages": [{"role": "user", "content": "你好"}]}
        )
        assert code in result.text
        assert "event: done" not in result.text


def test_length_limit_is_reported_in_done():
    text = frame("部分答案") + frame(finish_reason="length") + "data: [DONE]\n\n"
    with TestClient(provider_app(lambda _: upstream(text))) as client:
        result = client.post(
            "/api/chat/stream", json={"messages": [{"role": "user", "content": "你好"}]}
        )
        assert '"finish_reason": "length"' in result.text


def test_mock_mode_is_explicit_and_uses_no_provider():
    def deny_network(_):
        raise AssertionError("Mock mode must not call a provider")

    with TestClient(
        create_app(settings(chat_mode="mock"), httpx.MockTransport(deny_network))
    ) as client:
        assert client.get("/api/config").json()["mode"] == "mock"
        response = client.post(
            "/api/chat/stream", json={"messages": [{"role": "user", "content": "API是什么"}]}
        )
        assert "event: done" in response.text
        assert "模拟" in response.text


def test_context_limits_apply_on_server():
    messages = []
    for _ in range(6):
        messages.extend(
            [{"role": "user", "content": "问"}, {"role": "assistant", "content": "a" * 6000}]
        )
    messages.append({"role": "user", "content": "再问"})
    with pytest.raises(ValueError):
        ChatRequest(messages=messages)


async def test_disconnect_cancels_blocked_upstream_before_first_token():
    disconnected = asyncio.Event()
    started = asyncio.Event()
    closed = asyncio.Event()

    async def receive():
        await disconnected.wait()
        return {"type": "http.disconnect"}

    async def source():
        try:
            started.set()
            await asyncio.sleep(100)
            yield "never"
        finally:
            closed.set()

    request = Request({"type": "http", "method": "POST", "path": "/", "headers": []}, receive)
    stream = disconnect_aware(source(), request, heartbeat_seconds=10)
    task = asyncio.create_task(anext(stream))
    await asyncio.wait_for(started.wait(), timeout=1)
    disconnected.set()
    with pytest.raises(StopAsyncIteration):
        await asyncio.wait_for(task, timeout=1)
    assert closed.is_set()


@pytest.mark.parametrize("spec_version", ["2.3", "2.4"])
async def test_asgi_disconnect_finishes_async_upstream_close(spec_version):
    disconnected = asyncio.Event()
    started = asyncio.Event()
    closed = asyncio.Event()

    class BlockingUpstream(httpx.AsyncByteStream):
        async def __aiter__(self):
            started.set()
            await asyncio.Event().wait()
            yield b"never"

        async def aclose(self):
            # Closing a real socket/pool connection needs an async checkpoint.
            await asyncio.sleep(0)
            closed.set()

    async def receive():
        await disconnected.wait()
        return {"type": "http.disconnect"}

    async def send(_message):
        pass

    scope = {
        "type": "http",
        "method": "POST",
        "path": "/",
        "headers": [],
        "asgi": {"spec_version": spec_version},
    }
    transport = httpx.MockTransport(
        lambda _: httpx.Response(
            200,
            headers={"content-type": "text/event-stream"},
            stream=BlockingUpstream(),
        )
    )
    async with httpx.AsyncClient(transport=transport) as client:
        source = deepseek_events(
            client,
            settings(deepseek_api_key="test-only"),
            ChatRequest(messages=[{"role": "user", "content": "测试取消"}]),
        )
        response = StreamingResponse(disconnect_aware(source, Request(scope, receive)))
        task = asyncio.create_task(response(scope, receive, send))
        try:
            await asyncio.wait_for(started.wait(), timeout=1)
            disconnected.set()
            await asyncio.wait_for(task, timeout=1)
            assert closed.is_set()
        finally:
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)
