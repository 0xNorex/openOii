"""Run timing: elapsed per stage and overall, and the remaining estimate (P1-8)."""

from __future__ import annotations

from datetime import datetime, timedelta

import pytest
from sqlalchemy import text

from app.db.utils import utcnow
from app.services.run_timing import build_run_timing, estimate_remaining, parse_timestamp
from tests.factories import create_project, create_run

_ATTEMPTS_DDL = (
    "CREATE TABLE IF NOT EXISTS engine_stage_attempts ("
    "id INTEGER PRIMARY KEY AUTOINCREMENT, stage_attempt_id TEXT NOT NULL UNIQUE, run_id INTEGER NOT NULL, "
    "stage TEXT NOT NULL, attempt INTEGER NOT NULL, status TEXT NOT NULL, "
    "started_at TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT '', finished_at TEXT)"
)


def _iso(value: datetime) -> str:
    """Engine format: ISO-8601 with a trailing Z."""
    return value.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


async def _attempt(session, run_id: int, stage: str, start: datetime, seconds: float | None, status="succeeded", attempt=1):
    await session.execute(text(_ATTEMPTS_DDL))
    finished = _iso(start + timedelta(seconds=seconds)) if seconds is not None else None
    await session.execute(
        text(
            "INSERT INTO engine_stage_attempts (stage_attempt_id, run_id, stage, attempt, status, started_at, finished_at) "
            "VALUES (:id, :run, :stage, :attempt, :status, :start, :finished)"
        ),
        {
            "id": f"{run_id}-{stage}-{attempt}",
            "run": run_id,
            "stage": stage,
            "attempt": attempt,
            "status": status,
            "start": _iso(start),
            "finished": finished,
        },
    )


_DURATIONS = {
    "plan_outline": 60,
    "plan_characters": 60,
    "plan_shots": 60,
    "render_characters": 180,
    "render_shots": 180,
    "compose_videos": 200,
    "compose_merge": 5,
}


async def _finished_history(session, project_id: int) -> None:
    previous = await create_run(session, project_id, "succeeded")
    start = utcnow() - timedelta(hours=2)
    for stage, seconds in _DURATIONS.items():
        await _attempt(session, previous.id, stage, start, seconds)
        start += timedelta(seconds=seconds + 30)
    await session.commit()


def test_parse_timestamp_reads_engine_and_backend_formats():
    assert parse_timestamp("2026-10-29T15:45:15.642Z") == datetime(2026, 10, 29, 15, 45, 15, 642000)
    assert parse_timestamp("2026-10-29 15:45:15.642") == datetime(2026, 10, 29, 15, 45, 15, 642000)
    assert parse_timestamp("not a time") is None
    assert parse_timestamp(None) is None


def test_estimate_needs_history_for_every_required_stage():
    history = {"render_shots": [100.0, 300.0, 200.0], "compose_videos": [50.0]}
    # median 200 - 30 elapsed, plus 50
    assert estimate_remaining(
        history=history,
        remaining_stages=["render_shots", "critique_shot_images", "compose_videos"],
        current_stage="render_shots",
        current_elapsed=30,
    ) == 220.0
    # a stage with no history at all → no estimate (the UI shows elapsed only)
    assert estimate_remaining(
        history=history, remaining_stages=["render_shots", "compose_merge"], current_stage=None, current_elapsed=None
    ) is None
    # already past the typical duration: keep a tenth of it rather than 0
    assert estimate_remaining(
        history={"compose_videos": [50.0]}, remaining_stages=["compose_videos"], current_stage="compose_videos", current_elapsed=500
    ) == 5.0


@pytest.mark.asyncio
async def test_running_run_reports_stage_elapsed_and_remaining(test_session):
    project = await create_project(test_session)
    await _finished_history(test_session, project.id)
    run = await create_run(test_session, project.id, "running")
    now = utcnow()
    run.started_at = now - timedelta(minutes=10)
    test_session.add(run)
    await _attempt(test_session, run.id, "plan_outline", now - timedelta(minutes=10), 90)
    await _attempt(test_session, run.id, "plan_characters", now - timedelta(minutes=8), 60)
    await _attempt(test_session, run.id, "plan_shots", now - timedelta(minutes=6), 60)
    # render_characters failed once, then a second attempt is running for 40 s
    await _attempt(test_session, run.id, "render_characters", now - timedelta(minutes=4), 20, status="failed")
    await _attempt(test_session, run.id, "render_characters", now - timedelta(seconds=40), None, status="started", attempt=2)
    await test_session.commit()

    timing = await build_run_timing(test_session, run, now=now)

    assert timing.active and not timing.at_gate
    assert timing.current_stage == "render_characters"
    assert timing.elapsed_seconds == pytest.approx(600, abs=1)
    stages = {stage.stage: stage for stage in timing.stages}
    assert stages["plan_outline"].elapsed_seconds == pytest.approx(90)
    assert stages["plan_outline"].estimate_seconds == 60
    current = stages["render_characters"]
    assert current.status == "running" and current.attempts == 2
    # only time actually running counts: 20 s failed + 40 s now, not the pause between
    assert current.elapsed_seconds == pytest.approx(60, abs=1)
    # render_characters 180 - 60, then render_shots 180, compose 200 + 5; critiques have no history → 0
    assert timing.estimate_basis == "history"
    assert timing.remaining_seconds == pytest.approx(120 + 180 + 200 + 5, abs=1)


@pytest.mark.asyncio
async def test_gate_waits_are_not_predicted(test_session):
    project = await create_project(test_session)
    await _finished_history(test_session, project.id)
    run = await create_run(test_session, project.id, "waiting_for_approval")
    now = utcnow()
    run.started_at = now - timedelta(minutes=5)
    run.awaiting_payload = {"current_stage": "shots_approval", "gate": "plan"}
    test_session.add(run)
    for stage in ("plan_outline", "plan_characters", "plan_shots"):
        await _attempt(test_session, run.id, stage, now - timedelta(minutes=5), 60)
    await test_session.commit()

    timing = await build_run_timing(test_session, run, now=now)

    assert timing.at_gate and timing.current_stage == "shots_approval"
    assert timing.remaining_seconds == pytest.approx(180 + 180 + 200 + 5, abs=1)


@pytest.mark.asyncio
async def test_first_run_without_history_has_no_estimate(async_client, test_session):
    project = await create_project(test_session)
    run = await create_run(test_session, project.id, "running")
    run.started_at = utcnow() - timedelta(seconds=30)
    test_session.add(run)
    await _attempt(test_session, run.id, "plan_outline", utcnow() - timedelta(seconds=30), None, status="started")
    await test_session.commit()

    res = await async_client.get(f"/api/v1/runs/{run.id}/timing")

    assert res.status_code == 200, res.text
    body = res.json()
    assert body["remaining_seconds"] is None
    assert body["estimate_basis"] == "none"
    assert body["current_stage"] == "plan_outline"
    assert body["elapsed_seconds"] >= 29
    assert body["started_at"].endswith("Z")


@pytest.mark.asyncio
async def test_timing_without_engine_tables_is_elapsed_only(async_client, test_session):
    project = await create_project(test_session)
    run = await create_run(test_session, project.id, "succeeded")
    run.started_at = run.created_at
    test_session.add(run)
    await test_session.commit()

    res = await async_client.get(f"/api/v1/runs/{run.id}/timing")

    assert res.status_code == 200, res.text
    assert res.json()["stages"] == [] and res.json()["active"] is False
