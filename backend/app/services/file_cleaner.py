"""文件清理服务

负责删除旧的图片和视频文件，避免磁盘空间浪费。
"""

from __future__ import annotations

import logging
from pathlib import Path

logger = logging.getLogger(__name__)

# 静态文件目录
STATIC_DIR = Path(__file__).parent.parent / "static"


def _extract_static_path(url: str | None) -> str | None:
    if not url:
        return None
    if url.startswith("/static/"):
        return url
    return None


def is_local_file(url: str | None) -> bool:
    """判断 URL 是否指向本地文件"""
    return _extract_static_path(url) is not None


def get_local_path(url: str) -> Path | None:
    """将本地 URL 转换为文件系统路径

    安全检查：验证最终路径在 STATIC_DIR 内，防止路径遍历攻击
    """
    static_path = _extract_static_path(url)
    if not static_path:
        return None
    # /static/videos/xxx.mp4 -> backend/app/static/videos/xxx.mp4
    relative_path = static_path.removeprefix("/static/")
    resolved_path = (STATIC_DIR / relative_path).resolve()

    # 安全检查：确保路径在 STATIC_DIR 内
    try:
        resolved_path.relative_to(STATIC_DIR.resolve())
    except ValueError:
        logger.warning(f"Path traversal attempt detected: {url}")
        return None

    return resolved_path


def delete_file(url: str | None) -> bool:
    """Media unlink is disabled until shared-reference cleanup can prove safety."""
    logger.debug("Media cleanup skipped until reference-safe collection is configured: %s", url)
    return False


def delete_files(urls: list[str | None]) -> int:
    return sum(delete_file(url) for url in urls)
