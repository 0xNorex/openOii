from __future__ import annotations

import re
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.base import TargetIds
from app.models.agent_run import AgentRun
from app.models.project import Character, Project, Shot

_SHOT_ORDER_RE = re.compile(
    r"(?:第\s*(\d+)\s*(?:个)?\s*(?:镜头|分镜|格)|(?:镜头|分镜|格|shot)\s*#?\s*(\d+))",
    re.IGNORECASE,
)


def _blocking_clip_reason(status: str) -> str:
    return {
        "missing": "当前分镜视频尚未生成",
        "generating": "当前分镜视频仍在生成中",
        "failed": "当前分镜视频生成失败",
    }.get(status, "当前分镜视频不可用于最终拼接")


async def collect_project_blocking_clips(
    session: AsyncSession, project: Project
) -> list[dict[str, Any]]:
    if project.id is None:
        return []

    shot_res = await session.execute(
        select(Shot).where(Shot.project_id == project.id).order_by(Shot.order.asc())
    )
    shots = list(shot_res.scalars().all())

    run_res = await session.execute(
        select(AgentRun)
        .where(AgentRun.project_id == project.id)
        .where(AgentRun.resource_type == "shot")
        .where(AgentRun.resource_id.isnot(None))
        .order_by(AgentRun.updated_at.desc())
    )
    runs = list(run_res.scalars().all())

    latest_status_by_shot: dict[int, str] = {}
    for run in runs:
        if run.resource_id is None:
            continue
        if run.resource_id in latest_status_by_shot:
            continue
        latest_status_by_shot[run.resource_id] = run.status

    blocking_clips: list[dict[str, Any]] = []
    for shot in shots:
        if shot.id is None:
            continue

        run_status = latest_status_by_shot.get(shot.id)
        clip_status = "complete"
        if run_status in {"queued", "running"}:
            clip_status = "generating"
        elif run_status == "failed" and not shot.video_url:
            clip_status = "failed"
        elif not shot.video_url:
            clip_status = "missing"

        if clip_status == "complete":
            continue

        blocking_clips.append(
            {
                "shot_id": shot.id,
                "order": shot.order,
                "status": clip_status,
                "reason": _blocking_clip_reason(clip_status),
            }
        )

    return blocking_clips


def infer_feedback_targets(data: dict[str, Any], state: dict[str, Any]) -> TargetIds | None:
    """Infer targets only from feedback text that maps to this project's entities."""

    feedback_text = ""
    if isinstance(data, dict):
        for key in ("feedback", "content", "user_feedback", "text"):
            raw = data.get(key)
            if isinstance(raw, str) and raw.strip():
                feedback_text = raw.strip()
                break

    if not feedback_text:
        return None

    parsed_character_ids: list[int] = []
    parsed_shot_ids: list[int] = []
    characters = state.get("characters") if isinstance(state, dict) else []
    shots = state.get("shots") if isinstance(state, dict) else []

    # Longer names first so "小明同学" wins over "小明"
    named_chars: list[tuple[str, int]] = []
    for character in characters if isinstance(characters, list) else []:
        if not isinstance(character, dict):
            continue
        name = character.get("name")
        character_id = character.get("id")
        if isinstance(name, str) and name.strip() and isinstance(character_id, int):
            named_chars.append((name.strip(), character_id))
    order_to_shot: dict[int, list[int]] = {}
    for shot in shots if isinstance(shots, list) else []:
        if not isinstance(shot, dict):
            continue
        shot_id = shot.get("id")
        order = shot.get("order")
        if isinstance(shot_id, int) and isinstance(order, int):
            order_to_shot.setdefault(order, []).append(shot_id)

    for item in (feedback_text,):
        matching_names = {name for name, _ in named_chars if name in item}
        longest_names = {
            name for name in matching_names
            if not any(len(other) > len(name) and name in other for other in matching_names)
        }
        for name in longest_names:
            matches = [character_id for candidate, character_id in named_chars if candidate == name]
            if len(matches) == 1:
                parsed_character_ids.append(matches[0])
        for match in _SHOT_ORDER_RE.finditer(item):
            order = int(match.group(1) or match.group(2))
            shot_ids_for_order = order_to_shot.get(order, [])
            if len(shot_ids_for_order) == 1:
                parsed_shot_ids.extend(shot_ids_for_order)

    character_ids = list(dict.fromkeys(parsed_character_ids))
    shot_ids = list(dict.fromkeys(parsed_shot_ids))
    if character_ids or shot_ids:
        return TargetIds(character_ids=character_ids, shot_ids=shot_ids)
    return None


def has_unresolved_feedback_target(feedback: str, state: dict[str, Any]) -> bool:
    """Return true when explicit text points at a missing or ambiguous project entity."""
    characters = state.get("characters") if isinstance(state, dict) else []
    names = [
        item.get("name").strip()
        for item in characters if isinstance(item, dict)
        and isinstance(item.get("name"), str) and item["name"].strip()
    ] if isinstance(characters, list) else []
    matching_names = {name for name in names if name in feedback}
    longest_names = {
        name for name in matching_names
        if not any(len(other) > len(name) and name in other for other in matching_names)
    }
    if any(names.count(name) > 1 for name in longest_names):
        return True

    shots = state.get("shots") if isinstance(state, dict) else []
    order_counts: dict[int, int] = {}
    if isinstance(shots, list):
        for shot in shots:
            if isinstance(shot, dict) and isinstance(shot.get("order"), int):
                order = shot["order"]
                order_counts[order] = order_counts.get(order, 0) + 1
    for match in _SHOT_ORDER_RE.finditer(feedback):
        if order_counts.get(int(match.group(1) or match.group(2)), 0) != 1:
            return True
    return False


async def apply_character_rerun_edits(
    session: AsyncSession,
    character: Character,
    *,
    description: str | None = None,
    image_url: str | None = None,
) -> Character:
    if description is not None:
        character.description = description
    if image_url is not None:
        character.image_url = image_url
    session.add(character)
    await session.flush()
    return character


async def invalidate_character_downstream_outputs(
    session: AsyncSession,
    project: Project,
    character_id: int,
) -> None:
    if project.video_url:
        project.status = "superseded"
    session.add(project)
    await session.flush()


async def invalidate_shot_storyboard_outputs(
    session: AsyncSession,
    project: Project,
    shot: Shot,
) -> None:
    if project.video_url:
        project.status = "superseded"
    session.add(project)
    await session.flush()


async def invalidate_shot_clip_output(
    session: AsyncSession,
    project: Project,
) -> None:
    if project.video_url:
        project.status = "superseded"
    session.add(project)
    await session.flush()
