"""Run recovery summary.

State source is the engine's own checkpoint table (`engine_checkpoints`, owned by
the pi sidecar) plus the project's persisted artifacts. The former LangGraph
checkpointer path is gone: the sidecar is the only orchestration engine.
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any, Literal, cast

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import InstrumentedAttribute

from app.generated.workflow_contract import WORKFLOW_VERSION
from app.models.agent_run import AgentMessage, AgentRun
from app.models.project import Character, Shot
from app.orchestration import PHASE2_STAGE_ORDER, PRODUCTION_STAGE_SEQUENCE
from app.services.run_signals import GRAPH_STAGE_FOR_AGENT
from app.schemas.project import (
    AgentRunRead,
    RecoveryControlRead,
    RecoveryStageRead,
    RecoverySummaryRead,
)


def _valid_execution_command(value: Any) -> bool:
    def valid_ids(ids: Any) -> bool:
        return (
            isinstance(ids, list)
            and all(isinstance(item, int) and not isinstance(item, bool) and item > 0 for item in ids)
            and len(set(ids)) == len(ids)
        )

    if not isinstance(value, dict):
        return False
    stage = value.get("stage")
    characters = value.get("target_character_ids")
    shots = value.get("target_shot_ids")
    return (
        type(value.get("version")) is int
        and value.get("version") == 1
        and isinstance(stage, str)
        and (stage == "full" or stage in PRODUCTION_STAGE_SEQUENCE)
        and isinstance(value.get("auto_mode"), bool)
        and isinstance(value.get("user_feedback"), str)
        and valid_ids(characters)
        and valid_ids(shots)
        and not (characters and shots)
        and (not characters or stage == "render_characters")
        and (not shots or stage in {"render_shots", "compose_videos"})
        and (
            "force_regenerate" not in value
            or isinstance(value.get("force_regenerate"), bool)
        )
        and (
            not characters and not shots
            or isinstance(value.get("force_regenerate"), bool)
        )
    )


def _safe_stage_name(value: Any) -> str | None:
    if isinstance(value, str) and value in PRODUCTION_STAGE_SEQUENCE:
        return value
    return None


async def _engine_checkpoint_stages(
    session: AsyncSession, run_id: int | None
) -> list[str] | None:
    """Checkpoint stages, or None when the checkpoint query fails."""
    if run_id is None:
        return None
    try:
        result = await session.execute(
            text("SELECT stage FROM engine_checkpoints WHERE run_id = :run_id"),
            {"run_id": run_id},
        )
        rows = {row[0] for row in result.all()}
    except Exception:  # noqa: BLE001 - table missing on un-migrated SQLite
        return None
    known_stages = [stage for stage in PRODUCTION_STAGE_SEQUENCE if stage in rows]
    return known_stages + sorted(rows - set(PRODUCTION_STAGE_SEQUENCE))


def _infer_current_stage(run: AgentRun, completed: Sequence[str]) -> str:
    if completed:
        index = PRODUCTION_STAGE_SEQUENCE.index(completed[-1])
        if index + 1 < len(PRODUCTION_STAGE_SEQUENCE):
            return PRODUCTION_STAGE_SEQUENCE[index + 1]
        return completed[-1]
    mapped_stage = GRAPH_STAGE_FOR_AGENT.get(run.current_agent or "")
    if mapped_stage is not None:
        return mapped_stage
    return "plan_outline"


async def _stage_artifact_counts(session: AsyncSession, project_id: int) -> dict[str, int]:
    """Per-stage entity counts derived from persisted project entities.

    The legacy Stage/Artifact tables were dropped in migration 0027; the
    entities themselves are the durable record, so count those instead.
    """
    project_id_col = cast(InstrumentedAttribute[int], cast(object, Character.project_id))
    shot_project_id_col = cast(InstrumentedAttribute[int], cast(object, Shot.project_id))
    character_count = func.count(cast(Any, Character.id))
    shot_count = func.count(cast(Any, Shot.id))

    chars = await session.execute(
        select(character_count).select_from(Character).where(project_id_col == project_id)
    )
    shots = await session.execute(
        select(shot_count).select_from(Shot).where(shot_project_id_col == project_id)
    )
    character_total = int(chars.scalar() or 0)
    shot_total = int(shots.scalar() or 0)
    if character_total == 0 and shot_total == 0:
        return {}
    return {
        "plan_characters": character_total,
        "plan_shots": shot_total,
    }


async def build_recovery_summary(
    *,
    session: AsyncSession,
    database_url: str = "",
    run: AgentRun,
) -> RecoverySummaryRead:
    _ = database_url  # kept for call-site compatibility; engine state is DB-resident
    run_id = run.id
    run_pk = run_id if run_id is not None else 0
    checkpoint_stages = await _engine_checkpoint_stages(session, run_id)
    context_valid = isinstance(run.context_snapshot, dict)
    snapshot = run.context_snapshot if context_valid else {}
    command = snapshot.get("execution_command")
    recoverable_command = _valid_execution_command(command)
    if (
        context_valid
        and "execution_command" not in snapshot
        and run.current_agent == "orchestrator"
        and run.resource_type is None
        and run.patch_plan is None
    ):
        try:
            events = await session.execute(
                text("SELECT 1 FROM engine_run_events WHERE run_id = :run_id LIMIT 1"),
                {"run_id": run_id},
            )
            checkpoint = await session.execute(
                text("SELECT 1 FROM engine_checkpoints WHERE run_id = :run_id LIMIT 1"),
                {"run_id": run_id},
            )
            user_message = await session.execute(
                select(AgentMessage.id)
                .where(AgentMessage.run_id == run_id, AgentMessage.role == "user")
                .limit(1)
            )
            recoverable_command = (
                events.first() is None
                and checkpoint.first() is None
                and user_message.first() is None
            )
        except Exception:  # noqa: BLE001 - missing engine tables cannot prove provenance
            recoverable_command = False
    completed_stages = [
        stage for stage in checkpoint_stages or [] if stage in PRODUCTION_STAGE_SEQUENCE
    ]
    current_stage = _infer_current_stage(run, completed_stages)
    if checkpoint_stages == [] and isinstance(run.context_snapshot, dict):
        execution_command = run.context_snapshot.get("execution_command")
        if isinstance(execution_command, dict):
            current_stage = _safe_stage_name(execution_command.get("stage")) or current_stage
    artifact_counts = await _stage_artifact_counts(session, run.project_id)

    stage_history = [
        RecoveryStageRead(
            name=stage,
            status="current"
            if stage == current_stage
            else "completed"
            if stage in completed_stages
            else "pending",
            artifact_count=artifact_counts.get(stage, 0),
        )
        for stage in PHASE2_STAGE_ORDER
    ]

    preserved_stages = [stage.name for stage in stage_history if stage.status == "completed"]

    return RecoverySummaryRead(
        project_id=run.project_id,
        run_id=run_pk,
        current_stage=current_stage,
        next_stage=current_stage,
        preserved_stages=preserved_stages,
        stage_history=stage_history,
        resumable=(
            run.status in {"queued", "running", "failed", "cancelled"}
            and recoverable_command
            and run.workflow_version == WORKFLOW_VERSION
        ),
    )


async def build_recovery_control_surface(
    *,
    session: AsyncSession,
    database_url: str = "",
    run: AgentRun,
    state: Literal["active", "recoverable"],
) -> RecoveryControlRead:
    summary = await build_recovery_summary(session=session, database_url=database_url, run=run)
    detail = (
        "Project already has an active run" if state == "active" else "Project has a resumable run"
    )
    return RecoveryControlRead(
        state=state,
        detail=(
            detail
            if summary.resumable
            else "Run command, workflow version, or original scope is incompatible; resume is unavailable"
        ),
        available_actions=["resume", "cancel"] if summary.resumable else ["cancel"],
        active_run=AgentRunRead.model_validate(run),
        recovery_summary=summary,
    )
