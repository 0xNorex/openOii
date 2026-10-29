"""Run confirm signal + awaiting payload (agentrun 列；替代原 Redis 实现).

信号位跨进程可见（Python 与 workflow engine sidecar 经共享 SQLite 读写同一列），
编排侧轮询消费；payload 用于 WS 重连补发。

Stage/agent 映射由 contracts/workflow.json 生成，不能在这里再维护一份。
"""

from __future__ import annotations

import asyncio

from sqlalchemy import select, update

from app.generated.workflow_contract import (
    GRAPH_STAGE_FOR_AGENT as GRAPH_STAGE_FOR_AGENT,
    STAGE_AGENT_MAP,
)
from app.models.agent_run import AgentRun

_CONFIRM_POLL_INTERVAL_S = 0.3

# Compatibility aliases for callers that still use the old names. All point to
# the generated canonical map.
AGENT_STAGE_MAP = STAGE_AGENT_MAP
RESUME_AGENT_FOR_STAGE = STAGE_AGENT_MAP


def resume_agent_for_stage(stage: str | None) -> str:
    if not isinstance(stage, str):
        return "plan"
    return RESUME_AGENT_FOR_STAGE.get(stage, "plan")


async def _update_run_columns(
    run_id: int, *, project_id: int | None = None, **values: object
) -> None:
    from app.db.session import async_session_maker

    stmt = update(AgentRun).where(AgentRun.id == run_id)
    if project_id is not None:
        stmt = stmt.where(AgentRun.project_id == project_id)
    async with async_session_maker() as session:
        await session.execute(stmt.values(**values))
        await session.commit()


async def trigger_confirm_signal(run_id: int, project_id: int | None = None) -> bool:
    """设置 run 的审批信号位（替代原 Redis confirm key）。"""
    await _update_run_columns(run_id, project_id=project_id, confirm_requested=True)
    return True


async def clear_confirm_signal(run_id: int) -> None:
    await _update_run_columns(run_id, confirm_requested=False)


async def wait_for_confirm_signal(run_id: int, timeout: int = 1800) -> bool:
    """轮询等待审批信号；使用独立 session，不复用编排会话。"""
    from app.db.session import async_session_maker

    loop = asyncio.get_running_loop()
    deadline = loop.time() + timeout
    while loop.time() < deadline:
        async with async_session_maker() as session:
            res = await session.execute(
                select(AgentRun.confirm_requested).where(AgentRun.id == run_id)
            )
            requested = res.scalar()
        if requested:
            await _update_run_columns(run_id, confirm_requested=False)
            return True
        await asyncio.sleep(_CONFIRM_POLL_INTERVAL_S)
    return False


async def store_awaiting_payload(run_id: int, payload: dict) -> None:
    """记录当前 run 在 gate 等待，附带 run_awaiting_confirm 事件 payload"""
    await _update_run_columns(run_id, awaiting_payload=payload)


async def clear_awaiting_payload(run_id: int) -> None:
    await _update_run_columns(run_id, awaiting_payload=None)


async def get_awaiting_payload(run_id: int) -> dict | None:
    from app.db.session import async_session_maker

    async with async_session_maker() as session:
        res = await session.execute(
            select(AgentRun.awaiting_payload).where(AgentRun.id == run_id)
        )
        payload = res.scalar()
    return payload if isinstance(payload, dict) else None


class GateFeedbackRejected(Exception):
    """The run is not waiting at a gate, or an earlier request is still unread."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


async def submit_gate_feedback(
    run_id: int,
    *,
    project_id: int,
    content: str,
    entity_type: str | None = None,
    entity_ids: list[int] | None = None,
) -> dict:
    """Record "request changes" for the gate a run is waiting at.

    This only stores the user's decision; the engine reads it, redoes the gate's
    stage with the feedback and comes back to the same gate (ADR 0008: the
    gateway never decides the next step). It never sets ``confirm_requested``,
    so feedback can no longer be mistaken for an approval.
    """
    from uuid import uuid4

    from app.db.session import async_session_maker
    from app.db.utils import utcnow
    from app.models.agent_run import AgentMessage
    from app.models.message import Message

    text = content.strip()
    ids = list(dict.fromkeys(entity_ids or [])) or None
    feedback = {
        "id": uuid4().hex[:12],
        "content": text,
        "entity_type": entity_type if ids else None,
        "entity_ids": ids,
        "received_at": utcnow().isoformat(),
    }
    async with async_session_maker() as session:
        result = await session.execute(
            update(AgentRun)
            .where(AgentRun.id == run_id)
            .where(AgentRun.project_id == project_id)
            .where(AgentRun.status == "waiting_for_approval")
            .where(AgentRun.confirm_requested.is_(False))  # type: ignore[union-attr]
            .where(AgentRun.gate_feedback.is_(None))  # type: ignore[union-attr]
            .where(AgentRun.cancel_requested_at.is_(None))  # type: ignore[union-attr]
            .values(gate_feedback=feedback)
        )
        if result.rowcount != 1:
            await session.rollback()
            run = await session.get(AgentRun, run_id)
            if run is None or run.project_id != project_id:
                raise GateFeedbackRejected("RUN_NOT_FOUND", "运行不存在")
            if run.gate_feedback:
                raise GateFeedbackRejected(
                    "GATE_FEEDBACK_PENDING", "上一条修改意见还在处理，完成后会回到这个闸门"
                )
            raise GateFeedbackRejected("RUN_NOT_AT_GATE", "当前不在审批闸门，意见没有提交")
        session.add(AgentMessage(run_id=run_id, agent="user", role="user", content=text))
        session.add(
            Message(project_id=project_id, run_id=run_id, agent="user", role="user", content=text)
        )
        await session.commit()
    return feedback


async def approve_gate(run_id: int, *, project_id: int) -> None:
    """Approve the gate a run is waiting at (the REST twin of the WS confirm).

    Refuses while a "request changes" is still being redone, so a stale click
    can never approve the version the user just asked to change.
    """
    from app.db.session import async_session_maker

    async with async_session_maker() as session:
        result = await session.execute(
            update(AgentRun)
            .where(AgentRun.id == run_id)
            .where(AgentRun.project_id == project_id)
            .where(AgentRun.status == "waiting_for_approval")
            .where(AgentRun.gate_feedback.is_(None))  # type: ignore[union-attr]
            .where(AgentRun.cancel_requested_at.is_(None))  # type: ignore[union-attr]
            .values(confirm_requested=True)
        )
        if result.rowcount != 1:
            await session.rollback()
            run = await session.get(AgentRun, run_id)
            if run is None or run.project_id != project_id:
                raise GateFeedbackRejected("RUN_NOT_FOUND", "运行不存在")
            if run.gate_feedback:
                raise GateFeedbackRejected(
                    "GATE_FEEDBACK_PENDING", "修改意见还在处理，新版本出来后再确认"
                )
            raise GateFeedbackRejected("RUN_NOT_AT_GATE", "当前不在审批闸门，无需确认")
        await session.commit()
