"""设置页「测试连接」的廉价探测与中文错误映射。

图像 / 视频测试以前会真的生成一张图、一段视频（慢、花钱）。这里改成
只读探测：OpenAI 兼容服务 GET {api_root}/models，豆包视频 GET 任务列表，
都带 10 秒超时。密钥只放在 Authorization 头里，绝不写进返回的 details
或日志。
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Literal

import httpx

PROBE_TIMEOUT_S = 10.0
DOUBAO_ARK_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3"

ProbeStatus = Literal["valid", "degraded", "invalid"]


@dataclass(frozen=True)
class ProbeOutcome:
    success: bool
    status: ProbeStatus
    message: str
    details: str


@dataclass(frozen=True)
class FailureText:
    message: str
    hint: str


def describe_http_status(code: int) -> FailureText:
    """HTTP 状态码 → 用户能看懂的中文原因和下一步。"""
    if code == 400:
        return FailureText("请求被拒绝", "服务返回 400：通常是模型名或参数不被该服务支持。")
    if code == 401:
        return FailureText(
            "API Key 无效",
            "服务返回 401：密钥填错、已过期，或与所选地域不匹配"
            "（阿里云百炼、MiniMax 等的密钥按地域区分）。",
        )
    if code == 403:
        return FailureText(
            "没有权限",
            "服务返回 403：密钥没有开通这个模型或服务，或账户未完成实名 / 已欠费。",
        )
    if code == 404:
        return FailureText(
            "地址不存在",
            "服务返回 404：检查 Base URL 和接口路径，常见原因是多写或漏写了 /v1。",
        )
    if code == 429:
        return FailureText(
            "请求太频繁或额度不足",
            "服务返回 429：触发限流或余额 / 配额已用完，稍后再试或到控制台充值。",
        )
    if code >= 500:
        return FailureText("服务端错误", f"服务返回 {code}：提供商暂时不可用，稍后再试。")
    return FailureText("连接失败", f"服务返回 HTTP {code}。")


TIMEOUT_TEXT = FailureText(
    "连接超时",
    f"{int(PROBE_TIMEOUT_S)} 秒内没有响应：检查网络 / 代理，或 Base URL 是否正确。",
)
NETWORK_TEXT = FailureText(
    "无法连接",
    "连不上服务器：检查 Base URL 的域名和端口，本地服务是否已启动。",
)

_STATUS_IN_TEXT = re.compile(
    r"(?:error code|status(?: code)?|http|failed)[:\s=]*([1-5]\d\d)\b|\b([1-5]\d\d)\s+(?:unauthorized|forbidden|not found|too many requests|bad request)",
    re.IGNORECASE,
)


def describe_exception(exc: BaseException) -> FailureText:
    if isinstance(exc, httpx.TimeoutException):
        return TIMEOUT_TEXT
    if isinstance(exc, httpx.HTTPStatusError):
        return describe_http_status(exc.response.status_code)
    if isinstance(exc, httpx.TransportError):
        return NETWORK_TEXT
    return describe_error_text(str(exc)) or FailureText("连接失败", "请检查配置后重试。")


def describe_error_text(text: str | None) -> FailureText | None:
    """从 SDK / 服务的英文报错里认出状态码、超时、网络错误。认不出返回 None。"""
    if not text:
        return None
    match = _STATUS_IN_TEXT.search(text)
    if match:
        return describe_http_status(int(match.group(1) or match.group(2)))
    lowered = text.lower()
    if "invalid_api_key" in lowered or "unauthorized" in lowered or "authentication" in lowered:
        return describe_http_status(401)
    if "rate limit" in lowered or "insufficient_quota" in lowered:
        return describe_http_status(429)
    if "timed out" in lowered or "timeout" in lowered:
        return TIMEOUT_TEXT
    if (
        "connection refused" in lowered
        or "connecterror" in lowered
        or "connection error" in lowered
        or "name or service not known" in lowered
        or "nodename nor servname" in lowered
    ):
        return NETWORK_TEXT
    return None


_RESOURCE_MARKERS = ("/images/", "/videos/", "/chat/", "/contents/", "/video/", "/audio/")


def models_probe_urls(base_url: str, endpoint: str) -> list[str]:
    """可以列模型的地址：先取接口路径之前的 API 根（…/v1），再退回 Base URL。"""
    base = (base_url or "").strip().rstrip("/")
    path = (endpoint or "").strip()
    if re.match(r"^https?://", path, re.IGNORECASE):
        full = path.rstrip("/")
    elif path:
        full = f"{base}/{path.lstrip('/')}".rstrip("/")
    else:
        full = base
    urls: list[str] = []
    for marker in _RESOURCE_MARKERS:
        index = full.find(marker)
        if index > 0:
            urls.append(f"{full[:index]}/models")
            break
    urls.append(f"{base}/models")
    seen: list[str] = []
    for url in urls:
        if url not in seen and url.startswith(("http://", "https://")):
            seen.append(url)
    return seen


def _model_ids(payload: object) -> list[str]:
    if not isinstance(payload, dict):
        return []
    data = payload.get("data")
    if not isinstance(data, list):
        return []
    return [str(item["id"]) for item in data if isinstance(item, dict) and item.get("id")]


async def probe_openai_compatible(
    *,
    label: str,
    base_url: str,
    endpoint: str,
    api_key: str | None,
    model: str | None,
    timeout_s: float = PROBE_TIMEOUT_S,
    transport: httpx.AsyncBaseTransport | None = None,
) -> ProbeOutcome:
    """GET /models 验证地址和密钥；不生成任何内容。"""
    if not (base_url or "").strip():
        return ProbeOutcome(False, "invalid", "缺少 Base URL", f"先选择{label}提供商，或填写 Base URL。")
    if not api_key:
        return ProbeOutcome(False, "invalid", "缺少 API Key", f"填写{label}服务的 API Key 后再测试。")
    headers = {"Authorization": f"Bearer {api_key}"}
    last_status: int | None = None
    async with httpx.AsyncClient(timeout=timeout_s, transport=transport) as client:
        for url in models_probe_urls(base_url, endpoint):
            try:
                response = await client.get(url, headers=headers)
            except Exception as exc:  # noqa: BLE001 - 网络错误统一映射
                failure = describe_exception(exc)
                return ProbeOutcome(False, "invalid", failure.message, failure.hint)
            last_status = response.status_code
            if response.status_code in (404, 405):
                continue
            if response.status_code >= 400:
                failure = describe_http_status(response.status_code)
                return ProbeOutcome(False, "invalid", failure.message, failure.hint)
            try:
                ids = _model_ids(response.json())
            except ValueError:
                ids = []
            if model and ids and model not in ids:
                return ProbeOutcome(
                    True,
                    "degraded",
                    f"{label}服务已连接，但模型列表里没有「{model}」",
                    "密钥有效。检查模型名拼写，或该模型需要先在控制台开通。",
                )
            suffix = f"，模型 {model}" if model else ""
            return ProbeOutcome(True, "valid", f"{label}服务连接成功", f"地址和密钥有效{suffix}。")
    if last_status in (404, 405):
        return ProbeOutcome(
            True,
            "degraded",
            f"{label}服务可达，但无法免费验证密钥",
            "该服务没有模型列表接口；保存后生成一次即可确认。",
        )
    failure = NETWORK_TEXT
    return ProbeOutcome(False, "invalid", failure.message, failure.hint)


async def probe_doubao_video(
    *,
    api_key: str | None,
    model: str | None,
    timeout_s: float = PROBE_TIMEOUT_S,
    transport: httpx.AsyncBaseTransport | None = None,
) -> ProbeOutcome:
    """火山方舟：查询视频任务列表（只读、免费）验证密钥。"""
    if not api_key:
        return ProbeOutcome(False, "invalid", "缺少 API Key", "填写火山方舟 API Key 后再测试。")
    url = f"{DOUBAO_ARK_BASE_URL}/contents/generations/tasks"
    async with httpx.AsyncClient(timeout=timeout_s, transport=transport) as client:
        try:
            response = await client.get(
                url,
                params={"page_num": 1, "page_size": 1},
                headers={"Authorization": f"Bearer {api_key}"},
            )
        except Exception as exc:  # noqa: BLE001
            failure = describe_exception(exc)
            return ProbeOutcome(False, "invalid", failure.message, failure.hint)
    if response.status_code >= 400:
        failure = describe_http_status(response.status_code)
        return ProbeOutcome(False, "invalid", failure.message, failure.hint)
    suffix = f"，模型 {model}" if model else ""
    return ProbeOutcome(True, "valid", "视频服务连接成功", f"火山方舟密钥有效{suffix}。")
