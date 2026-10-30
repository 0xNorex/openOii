"""角色圣经服务 — 维护角色视觉参考、人脸 embedding 和视觉描述。

为每个角色提供：
- visual_notes 自动生成（LLM 从 description 提取关键视觉特征）
- face_embedding 计算（InsightFace）
- 角色圣经文本合并（description + visual_notes → bible）
- 余弦相似度查找（检测重复/冲突角色）
"""

from __future__ import annotations

import json
import logging
import math
from typing import TYPE_CHECKING

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.face_cropper import detect_faces, is_face_cropping_available

if TYPE_CHECKING:
    from app.models.project import Character

logger = logging.getLogger(__name__)


async def compute_face_embedding(image_url: str) -> list[float] | None:
    """下载角色图片，调用 face_cropper.detect_faces() 提取 embedding。

    Args:
        image_url: 角色图片 URL

    Returns:
        512 维 embedding 向量列表，无法提取则返回 None
    """
    if not is_face_cropping_available():
        logger.info("InsightFace not available, skipping embedding computation")
        return None

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(image_url)
            response.raise_for_status()
            image_bytes = response.content
    except Exception as e:
        logger.warning("Failed to download image for embedding: %s", e)
        return None

    return compute_face_embedding_from_bytes(image_bytes)


def compute_face_embedding_from_bytes(image_bytes: bytes) -> list[float] | None:
    """Extract the highest-confidence face embedding from image bytes."""
    if not is_face_cropping_available():
        return None

    faces = detect_faces(image_bytes)
    if not faces:
        logger.info("No face detected in image")
        return None

    # Use the best-scoring face
    best_face = max(faces, key=lambda f: f["det_score"])
    embedding = best_face["embedding"]

    # Convert numpy array to list[float]
    if hasattr(embedding, "tolist"):
        embedding = embedding.tolist()

    return embedding  # type: ignore[no-any-return]


async def find_similar_characters(
    embedding: list[float],
    project_id: int,
    session: AsyncSession,
    *,
    threshold: float = 0.7,
    exclude_id: int | None = None,
) -> list[tuple[Character, float]]:
    """在项目内基于 embedding 余弦相似度查找相似角色。

    Args:
        embedding: 查询 embedding 向量
        project_id: 项目 ID
        session: 数据库 session
        threshold: 相似度阈值（0-1）
        exclude_id: 排除的角色 ID（通常是自身）

    Returns:
        [(Character, similarity_score), ...] 按相似度降序排列
    """
    from app.models.project import Character

    query = select(Character).where(
        Character.project_id == project_id,
        Character.face_embedding.is_not(None),
    )
    if exclude_id is not None:
        query = query.where(Character.id != exclude_id)

    res = await session.execute(query)
    characters = res.scalars().all()

    results: list[tuple[Character, float]] = []
    for char in characters:
        if not char.face_embedding:
            continue
        try:
            other_embedding = json.loads(char.face_embedding)
            if not isinstance(other_embedding, list) or len(other_embedding) != len(embedding):
                continue
            sim = _cosine_similarity(embedding, other_embedding)
            if sim >= threshold:
                results.append((char, sim))
        except (json.JSONDecodeError, ValueError):
            continue

    results.sort(key=lambda x: x[1], reverse=True)
    return results


def _cosine_similarity(a: list[float], b: list[float]) -> float:
    """计算两个向量的余弦相似度。"""
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(x * x for x in b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)
