from __future__ import annotations

import httpx
import pytest

from app.services import connection_probe as probe


@pytest.mark.parametrize(
    ("code", "message"),
    [
        (400, "请求被拒绝"),
        (401, "API Key 无效"),
        (403, "没有权限"),
        (404, "地址不存在"),
        (429, "请求太频繁或额度不足"),
        (502, "服务端错误"),
        (418, "连接失败"),
    ],
)
def test_describe_http_status(code, message):
    assert probe.describe_http_status(code).message == message


@pytest.mark.parametrize(
    ("text", "message"),
    [
        ("Error code: 401 - {'error': 'invalid'}", "API Key 无效"),
        ("image provider failed: 404", "地址不存在"),
        ("429 Too Many Requests", "请求太频繁或额度不足"),
        ("invalid_api_key", "API Key 无效"),
        ("insufficient_quota", "请求太频繁或额度不足"),
        ("Request timed out.", "连接超时"),
        ("[Errno 111] Connection refused", "无法连接"),
    ],
)
def test_describe_error_text(text, message):
    found = probe.describe_error_text(text)
    assert found is not None and found.message == message


def test_describe_error_text_ignores_urls_and_unknown_text():
    assert probe.describe_error_text("see http://127.0.0.1:18790/v1") is None
    assert probe.describe_error_text("") is None


def test_describe_exception_types():
    request = httpx.Request("GET", "https://x")
    assert probe.describe_exception(httpx.ConnectTimeout("t", request=request)).message == "连接超时"
    assert probe.describe_exception(httpx.ConnectError("c", request=request)).message == "无法连接"
    response = httpx.Response(403, request=request)
    err = httpx.HTTPStatusError("x", request=request, response=response)
    assert probe.describe_exception(err).message == "没有权限"


@pytest.mark.parametrize(
    ("base", "endpoint", "expected"),
    [
        ("https://api.openai.com/v1", "/images/generations", ["https://api.openai.com/v1/models"]),
        (
            "https://api-inference.modelscope.cn",
            "/v1/images/generations",
            ["https://api-inference.modelscope.cn/v1/models", "https://api-inference.modelscope.cn/models"],
        ),
        ("http://127.0.0.1:18790", "/v1/videos/generations", ["http://127.0.0.1:18790/v1/models", "http://127.0.0.1:18790/models"]),
        ("https://open.bigmodel.cn/api/paas/v4/", "images/generations", ["https://open.bigmodel.cn/api/paas/v4/models"]),
        ("https://h/v1", "https://other/v2/videos/generations", ["https://other/v2/models", "https://h/v1/models"]),
    ],
)
def test_models_probe_urls(base, endpoint, expected):
    assert probe.models_probe_urls(base, endpoint) == expected


@pytest.mark.asyncio
async def test_probe_falls_through_404_to_next_candidate_and_flags_unknown_model():
    seen: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(str(request.url))
        assert request.headers["authorization"] == "Bearer k"
        if request.url.path == "/v1/models":
            return httpx.Response(404)
        return httpx.Response(200, json={"data": [{"id": "a"}, {"id": "b"}]})

    outcome = await probe.probe_openai_compatible(
        label="图像",
        base_url="https://h",
        endpoint="/v1/images/generations",
        api_key="k",
        model="missing-model",
        transport=httpx.MockTransport(handler),
    )
    assert seen == ["https://h/v1/models", "https://h/models"]
    assert outcome.success is True
    assert outcome.status == "degraded"
    assert "missing-model" in outcome.message


@pytest.mark.asyncio
async def test_probe_maps_network_errors_and_never_echoes_key():
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused", request=request)

    outcome = await probe.probe_openai_compatible(
        label="视频",
        base_url="https://h/v1",
        endpoint="/videos/generations",
        api_key="secret-key-123",
        model="m",
        transport=httpx.MockTransport(handler),
    )
    assert outcome.success is False
    assert outcome.message == "无法连接"
    assert "secret-key-123" not in outcome.details + outcome.message


@pytest.mark.asyncio
async def test_probe_requires_base_url():
    outcome = await probe.probe_openai_compatible(
        label="图像", base_url="", endpoint="", api_key="k", model=None
    )
    assert outcome.message == "缺少 Base URL"


@pytest.mark.asyncio
async def test_doubao_probe_maps_401():
    outcome = await probe.probe_doubao_video(
        api_key="bad",
        model="m",
        transport=httpx.MockTransport(lambda request: httpx.Response(401)),
    )
    assert outcome.success is False
    assert outcome.message == "API Key 无效"
