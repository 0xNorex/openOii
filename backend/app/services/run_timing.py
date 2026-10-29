"""Elapsed time per run and per stage, and a rough remaining-time estimate.

Sources (migration 0030):
- ``agentrun.started_at``: stamped once by the engine when execution begins.
- ``engine_stage_attempts.started_at`` / ``finished_at``: one row per stage attempt.

The estimate is the median duration of the same stage in earlier runs, from
this project first (same cast and shot count) and otherwise from any project.
It covers the engine's work only; time spent waiting at an approval gate is the
user's and is not predicted. With no history the estimate is ``None`` and the
UI shows elapsed time alone.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from statistics import median

from sqlalchemy import text
from sqlalchemy.exc import OperationalError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.utils import as_naive_utc, utcnow
from app.generated.workflow_contract import PHASE2_STAGE_ORDER
from app.models.agent_run import AgentRun
from app.schemas.project import RunStageTimingRead, RunTimingRead

logger = logging.getLogger(__name__)

# 引擎干活的阶段（闸门是等人确认，不估）
WORK_STAGES: tuple[str, ...] = tuple(s for s in PHASE2_STAGE_ORDER if not s.endswith("_approval"))
# 审查可以关掉：没有历史时按 0 计，不让整个估算失效
OPTIONAL_STAGES = frozenset({"critique_character_images", "critique_shot_images"})
PROJECT_SAMPLES = 5
GLOBAL_SAMPLES = 10
_ACTIVE = {"queued", "running", "waiting_for_approval"}


def parse_timestamp(value: object) -> datetime | None:
    """Engine text ('…T…Z') or backend naive UTC → naive UTC."""
    if isinstance(value, datetime):
        return as_naive_utc(value)
    if not isinstance(value, str) or not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return as_naive_utc(parsed) if parsed.tzinfo else parsed


def _seconds(start: datetime | None, end: datetime | None) -> float | None:
    if start is None or end is None:
        return None
    return max(0.0, (end - start).total_seconds())


async def _attempt_rows(session: AsyncSession, sql: str, params: dict) -> list[dict]:
    try:
        result = await session.execute(text(sql), params)
    except OperationalError:  # engine table/column not migrated yet (tests, old DBs)
        logger.debug("engine_stage_attempts unavailable for run timing", exc_info=True)
        return []
    return [dict(row._mapping) for row in result]


async def stage_duration_history(
    session: AsyncSession, *, project_id: int, exclude_run_id: int
) -> dict[str, list[float]]:
    """Durations (s) of succeeded attempts per stage, newest first, this project first."""
    rows = await _attempt_rows(
        session,
        """
        SELECT a.stage AS stage, a.started_at AS started_at, a.finished_at AS finished_at,
               r.project_id AS project_id
        FROM engine_stage_attempts a JOIN agentrun r ON r.id = a.run_id
        WHERE a.status = 'succeeded' AND a.finished_at IS NOT NULL AND a.run_id <> :run_id
              AND r.resource_type IS NULL
        ORDER BY a.started_at DESC
        """,
        {"run_id": exclude_run_id},
    )
    own: dict[str, list[float]] = {}
    other: dict[str, list[float]] = {}
    for row in rows:
        seconds = _seconds(parse_timestamp(row["started_at"]), parse_timestamp(row["finished_at"]))
        if seconds is None:
            continue
        bucket = own if row["project_id"] == project_id else other
        bucket.setdefault(row["stage"], []).append(seconds)
    history: dict[str, list[float]] = {}
    for stage in WORK_STAGES:
        samples = own.get(stage, [])[:PROJECT_SAMPLES]
        if not samples:
            samples = other.get(stage, [])[:GLOBAL_SAMPLES]
        if samples:
            history[stage] = samples
    return history


def estimate_remaining(
    *,
    history: dict[str, list[float]],
    remaining_stages: list[str],
    current_stage: str | None,
    current_elapsed: float | None,
) -> float | None:
    """Seconds of engine work left, or None when history cannot cover it."""
    total = 0.0
    for stage in remaining_stages:
        samples = history.get(stage)
        if not samples:
            if stage in OPTIONAL_STAGES:
                continue
            return None
        typical = median(samples)
        if stage == current_stage and current_elapsed is not None:
            # 已经超过典型时长：至少再留典型时长的一成，不显示「约剩 0」
            typical = max(typical - current_elapsed, typical * 0.1)
        total += typical
    return round(total, 1)


async def build_run_timing(
    session: AsyncSession, run: AgentRun, *, now: datetime | None = None
) -> RunTimingRead:
    now = as_naive_utc(now) if now else utcnow()
    run_id = int(run.id or 0)
    rows = await _attempt_rows(
        session,
        """
        SELECT stage, attempt, status, started_at, finished_at
        FROM engine_stage_attempts WHERE run_id = :run_id ORDER BY started_at, attempt
        """,
        {"run_id": run_id},
    )
    active = run.status in _ACTIVE
    run_started = parse_timestamp(run.started_at)
    if run_started is None and rows:
        run_started = parse_timestamp(rows[0]["started_at"])
    run_end = now if active else parse_timestamp(run.updated_at)

    # 同一阶段的多次尝试（失败后续跑）：开始取第一次，状态和结束取最后一次
    by_stage: dict[str, dict] = {}
    for row in rows:
        stage = row["stage"]
        started = parse_timestamp(row["started_at"])
        finished = parse_timestamp(row["finished_at"])
        entry = by_stage.setdefault(stage, {"started_at": started, "attempts": 0, "work": 0.0})
        entry["attempts"] += 1
        entry["status"] = row["status"]
        entry["finished_at"] = finished
        # 只算真正跑的时间：两次尝试之间的停顿不算本步耗时
        end = finished or (now if active and row["status"] == "started" else None)
        entry["work"] += _seconds(started, end) or 0.0

    running_stage = next(
        (stage for stage, entry in by_stage.items() if entry["status"] == "started" and active),
        None,
    )
    gate = None
    if run.status == "waiting_for_approval" and isinstance(run.awaiting_payload, dict):
        candidate = run.awaiting_payload.get("current_stage") or run.awaiting_payload.get("stage")
        gate = candidate if isinstance(candidate, str) and candidate in PHASE2_STAGE_ORDER else None
    current_stage = gate or running_stage

    history = await stage_duration_history(session, project_id=run.project_id, exclude_run_id=run_id)
    stages = [
        RunStageTimingRead(
            stage=stage,
            status="running" if entry["status"] == "started" and active else entry["status"],
            attempts=entry["attempts"],
            elapsed_seconds=round(entry["work"], 1),
            estimate_seconds=round(median(history[stage]), 1) if stage in history else None,
        )
        for stage, entry in sorted(by_stage.items(), key=lambda kv: PHASE2_STAGE_ORDER.index(kv[0]) if kv[0] in PHASE2_STAGE_ORDER else 99)
    ]

    remaining: float | None = None
    if active and run.resource_type is None:
        done = {stage for stage, entry in by_stage.items() if entry["status"] == "succeeded"}
        anchor = current_stage or (stages[-1].stage if stages else "plan_outline")
        start_index = PHASE2_STAGE_ORDER.index(anchor) if anchor in PHASE2_STAGE_ORDER else 0
        remaining_stages = [
            stage
            for stage in PHASE2_STAGE_ORDER[start_index:]
            if stage in WORK_STAGES and stage not in done
        ]
        current_entry = by_stage.get(running_stage or "")
        remaining = estimate_remaining(
            history=history,
            remaining_stages=remaining_stages,
            current_stage=running_stage,
            current_elapsed=current_entry["work"] if current_entry else None,
        )

    return RunTimingRead(
        run_id=run_id,
        status=run.status,
        active=active,
        started_at=run_started.replace(tzinfo=UTC) if run_started else None,
        elapsed_seconds=round(_seconds(run_started, run_end) or 0.0, 1),
        current_stage=current_stage,
        at_gate=gate is not None,
        stages=stages,
        remaining_seconds=remaining,
        estimate_basis="history" if remaining is not None else "none",
    )
