"""视频服务工厂

根据配置选择使用 OpenAI 兼容接口或豆包视频服务。
"""

from __future__ import annotations

from typing import Any, Protocol, runtime_checkable

from app.config import Settings


@runtime_checkable
class VideoServiceProtocol(Protocol):
    """视频服务协议（接口定义）"""

    async def generate_url(
        self,
        *,
        prompt: str,
        image_bytes: bytes | None = None,
        image_url: str | None = None,
        **kwargs: Any,
    ) -> str:
        """生成视频并返回 URL

        Args:
            prompt: 视频描述文本
            image_bytes: 参考图片字节流（图生视频模式，OpenAI 兼容接口）
            image_url: 参考图片 URL（图生视频模式，豆包接口）
            **kwargs: 其他参数

        Returns:
            生成的视频 URL
        """
        ...

    async def merge_urls(self, video_urls: list[str]) -> str:
        """拼接多个视频 URL

        Args:
            video_urls: 要拼接的视频 URL 列表

        Returns:
            拼接后的视频 URL
        """
        ...


def create_video_service(settings: Settings) -> VideoServiceProtocol:
    """根据配置创建视频服务实例

    Args:
        settings: 应用配置

    Returns:
        视频服务实例（OpenAI 兼容或豆包）
    """
    provider = settings.video_provider.lower()

    if provider == "doubao":
        from app.services.doubao_video import DoubaoVideoService

        return DoubaoVideoService(settings)
    if provider == "openai":
        from app.services.video import VideoService

        return VideoService(settings)
    if provider == "fake":
        from app.services.fake_video import FakeVideoService

        return FakeVideoService(settings)
    from app.services.provider_resolution import VIDEO_VENDOR_KEYS

    if provider in VIDEO_VENDOR_KEYS:
        return EngineOnlyVideoService(provider)
    raise ValueError(f"Unsupported video provider: {settings.video_provider}")


class EngineOnlyVideoService:
    """可灵 / Vidu / CogVideoX / MiniMax / 通义万相 / Veo 只在 TS 引擎里生成。

    后端只在 ReviewAgent 分类重跑范围时构造 AgentContext，不会真的调用视频生成；
    万一被调用，给出明确的中文错误而不是静默失败。
    """

    def __init__(self, provider: str) -> None:
        self.provider = provider

    async def generate_url(self, **_: Any) -> str:
        raise RuntimeError(f"视频服务商 {self.provider} 只能通过生成引擎调用")

    async def merge_urls(self, video_urls: list[str]) -> str:
        raise RuntimeError(f"视频服务商 {self.provider} 只能通过生成引擎调用")
