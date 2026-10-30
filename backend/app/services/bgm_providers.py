"""背景音乐服务商。

每个服务商只负责「情绪 / 描述 + 时长 → mp3 字节」；循环、淡入淡出、闪避（ducking）
和混音在 AudioService.mix_film_bgm。接口按官方文档实现，来源见 docs/providers.md 的
「背景音乐」一节。密钥只放进请求头，不写日志、不进错误信息。
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import httpx

TIMEOUT = httpx.Timeout(300.0, connect=10.0)

DEFAULTS: dict[str, dict[str, str]] = {
    "library": {},
    "minimax": {"base_url": "https://api.minimaxi.com/v1", "model": "music-2.6"},
    "stability": {"base_url": "https://api.stability.ai", "model": "stable-audio-2.5"},
    # Suno 没有公开的官方 API；这里对接社区常用的 suno-api 兼容网关（/api/generate）
    "suno": {"base_url": "", "model": ""},
}

PROVIDERS = tuple(DEFAULTS)

_MOOD_PROMPTS = {
    "warm": "warm, gentle, hopeful",
    "happy": "cheerful, playful, bright",
    "sad": "melancholic, slow, tender",
    "suspense": "mysterious, tense, sparse",
    "action": "energetic, driving, adventurous",
    "ambient": "calm, airy, soft",
}


class BGMProviderError(RuntimeError):
    """服务商返回错误；message 已是中文、不含密钥。"""


@dataclass(frozen=True)
class BGMConfig:
    provider: str
    base_url: str
    api_key: str
    model: str

    @classmethod
    def build(cls, provider: str | None, base_url: str | None, api_key: str | None, model: str | None) -> "BGMConfig":
        provider = (provider or "library").lower()
        defaults = DEFAULTS.get(provider, {})
        return cls(
            provider=provider,
            base_url=(base_url or defaults.get("base_url", "")).rstrip("/"),
            api_key=api_key or "",
            model=model or defaults.get("model", ""),
        )


def music_prompt(mood: str, genre: str | None) -> str:
    """给云端音乐模型的描述：纯音乐、不抢台词。"""
    feel = _MOOD_PROMPTS.get(mood, _MOOD_PROMPTS["ambient"])
    style = f", fits a {genre} animated short" if genre else ", fits an animated short film"
    return (
        f"Instrumental background score, {feel}{style}; soft acoustic instruments, "
        "no vocals, no lyrics, steady low-key dynamics that sit under narration."
    )


def _raise_for(label: str, response: httpx.Response) -> None:
    if response.status_code < 400:
        return
    if response.status_code in (401, 403):
        raise BGMProviderError(f"{label}拒绝了密钥（HTTP {response.status_code}）")
    raise BGMProviderError(f"{label}返回 HTTP {response.status_code}：{response.text[:200]}")


async def generate(config: BGMConfig, prompt: str, duration: float) -> bytes:
    """返回 mp3 字节。library 由 AudioService 用本地曲库处理，不走这里。"""
    if config.provider in ("minimax", "stability") and not config.api_key:
        raise BGMProviderError("背景音乐服务商需要 BGM_API_KEY")
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        if config.provider == "minimax":
            return await _minimax(client, config, prompt)
        if config.provider == "stability":
            return await _stability(client, config, prompt, duration)
        if config.provider == "suno":
            return await _suno(client, config, prompt)
    raise BGMProviderError(f"不支持的背景音乐服务商：{config.provider}")


async def _minimax(client: httpx.AsyncClient, config: BGMConfig, prompt: str) -> bytes:
    response = await client.post(
        f"{config.base_url}/music_generation",
        headers={"Authorization": f"Bearer {config.api_key}"},
        json={
            "model": config.model,
            "prompt": prompt,
            "is_instrumental": True,
            "output_format": "hex",
            "audio_setting": {"sample_rate": 44100, "bitrate": 128000, "format": "mp3"},
        },
    )
    _raise_for("MiniMax 音乐", response)
    body = response.json()
    status = (body.get("base_resp") or {}).get("status_code", 0)
    if status:
        if status == 1004:
            raise BGMProviderError("MiniMax 音乐拒绝了密钥（1004）")
        raise BGMProviderError(f"MiniMax 音乐失败：{(body.get('base_resp') or {}).get('status_msg', status)}")
    audio = (body.get("data") or {}).get("audio") or ""
    if not audio:
        raise BGMProviderError("MiniMax 音乐没有返回音频")
    return bytes.fromhex(audio)


async def _stability(client: httpx.AsyncClient, config: BGMConfig, prompt: str, duration: float) -> bytes:
    seconds = max(1, min(190, math.ceil(duration)))
    response = await client.post(
        f"{config.base_url}/v2beta/audio/stable-audio-2/text-to-audio",
        headers={"authorization": f"Bearer {config.api_key}", "accept": "audio/*"},
        files={"none": (None, "")},
        data={"prompt": prompt, "model": config.model, "duration": str(seconds), "output_format": "mp3"},
    )
    _raise_for("Stable Audio", response)
    if not response.content:
        raise BGMProviderError("Stable Audio 没有返回音频")
    return response.content


async def _suno(client: httpx.AsyncClient, config: BGMConfig, prompt: str) -> bytes:
    if not config.base_url:
        raise BGMProviderError("Suno 兼容接口需要填写 BGM_BASE_URL")
    headers = {"Authorization": f"Bearer {config.api_key}"} if config.api_key else {}
    response = await client.post(
        f"{config.base_url}/api/generate",
        headers=headers,
        json={"prompt": prompt, "make_instrumental": True, "wait_audio": True},
    )
    _raise_for("Suno 兼容接口", response)
    body = response.json()
    items = body if isinstance(body, list) else body.get("data") or body.get("clips") or []
    url = next((item.get("audio_url") for item in items if isinstance(item, dict) and item.get("audio_url")), None)
    if not url:
        raise BGMProviderError("Suno 兼容接口没有返回 audio_url")
    audio = await client.get(url)
    _raise_for("Suno 音频下载", audio)
    return audio.content


async def probe(config: BGMConfig, library_count: int):
    """设置页「测试连接」：只读探测，不生成音乐、不计费。"""
    from app.services.connection_probe import PROBE_TIMEOUT_S, ProbeOutcome, describe_exception, describe_http_status

    if config.provider == "library":
        return ProbeOutcome(
            True,
            "valid",
            "背景音乐可用",
            f"本地曲库 {library_count} 首（缺的情绪会在第一次用到时自动合成）。",
        )
    if config.provider in ("minimax", "stability") and not config.api_key:
        return ProbeOutcome(False, "invalid", "缺少 API Key", "填写背景音乐服务的 API Key 后再测试。")
    if config.provider == "minimax":
        # 音乐接口没有只读查询；同一把密钥用音色列表验证
        request = ("POST", f"{config.base_url}/get_voice", {"Authorization": f"Bearer {config.api_key}"}, {"voice_type": "system"})
    elif config.provider == "stability":
        request = ("GET", f"{config.base_url}/v1/user/balance", {"authorization": f"Bearer {config.api_key}"}, None)
    elif config.provider == "suno":
        if not config.base_url:
            return ProbeOutcome(False, "invalid", "缺少接口地址", "填写 Suno 兼容网关的地址后再测试。")
        headers = {"Authorization": f"Bearer {config.api_key}"} if config.api_key else {}
        request = ("GET", f"{config.base_url}/api/get_limit", headers, None)
    else:
        return ProbeOutcome(False, "invalid", "不支持的背景音乐服务商", config.provider)

    method, url, headers, body = request
    async with httpx.AsyncClient(timeout=PROBE_TIMEOUT_S) as client:
        try:
            response = await client.request(method, url, headers=headers, json=body)
        except Exception as exc:  # noqa: BLE001
            failure = describe_exception(exc)
            return ProbeOutcome(False, "invalid", failure.message, failure.hint)
    if response.status_code >= 400:
        failure = describe_http_status(response.status_code)
        return ProbeOutcome(False, "invalid", failure.message, failure.hint)
    if config.provider == "minimax":
        try:
            status = (response.json().get("base_resp") or {}).get("status_code", 0)
        except ValueError:
            status = 0
        if status:
            return ProbeOutcome(False, "invalid", "MiniMax 拒绝了请求", f"状态码 {status}，检查密钥和接入地址。")
        return ProbeOutcome(
            True,
            "degraded",
            "MiniMax 密钥有效",
            "音乐接口没有只读查询，这里用同一把密钥验证；官方说明 2026-08-20 起付费音乐接口不再对新用户开放。",
        )
    return ProbeOutcome(True, "valid", "背景音乐服务连接成功", "地址和密钥有效。")
