"""Project-level "previous version" for full regenerations.

A full regenerate replaces the outline, the characters, the shots and finally
the cut. Before it starts, the API captures what the project looks like now and
keeps it on the new run (``context_snapshot["previous_version"]``). Stopping the
regenerate, or choosing "恢复上一版" afterwards, writes that capture back.

Writes go through SQLAlchemy Core on purpose: the restore replaces whole rows
(including their primary keys) and bumps ``revision`` explicitly, so the ORM's
compare-and-set version column must not get in the way.
"""

from __future__ import annotations

import hashlib
import json
from datetime import date, datetime
from typing import Any

from sqlalchemy import DateTime, delete, func, insert, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.utils import utcnow
from app.models.project import Character, Project, Shot, ShotCharacterBinding

SNAPSHOT_VERSION = 1

# Project columns a full regenerate rewrites. Settings the user owns (title,
# story, style, provider overrides, references) are not part of a "version".
PROJECT_FIELDS = (
    "summary",
    "story_outline",
    "visual_bible",
    "outline_approved",
    "video_url",
    "status",
)

_project_table = Project.__table__  # type: ignore[attr-defined]
_character_table = Character.__table__  # type: ignore[attr-defined]
_shot_table = Shot.__table__  # type: ignore[attr-defined]
_binding_table = ShotCharacterBinding.__table__  # type: ignore[attr-defined]


def _json_value(value: Any) -> Any:
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return value


def _row_dict(row: Any) -> dict[str, Any]:
    return {key: _json_value(value) for key, value in dict(row._mapping).items()}


def _restore_row(table: Any, row: dict[str, Any]) -> dict[str, Any]:
    restored: dict[str, Any] = {}
    for column in table.columns:
        if column.name not in row:
            continue
        value = row[column.name]
        if isinstance(column.type, DateTime) and isinstance(value, str):
            value = datetime.fromisoformat(value)
        restored[column.name] = value
    return restored


async def _rows(session: AsyncSession, table: Any, *where: Any, order_by: Any = None) -> list[dict[str, Any]]:
    stmt = select(table).where(*where)
    if order_by is not None:
        stmt = stmt.order_by(order_by)
    result = await session.execute(stmt)
    return [_row_dict(row) for row in result.all()]


async def capture_project_version(session: AsyncSession, project_id: int) -> dict[str, Any] | None:
    """What the project looks like now, or None when there is nothing to keep."""
    project_rows = await _rows(session, _project_table, _project_table.c.id == project_id)
    if not project_rows:
        return None
    project = project_rows[0]
    characters = await _rows(
        session, _character_table, _character_table.c.project_id == project_id, order_by=_character_table.c.id
    )
    shots = await _rows(session, _shot_table, _shot_table.c.project_id == project_id, order_by=_shot_table.c.id)
    if not characters and not shots and not project.get("video_url") and not project.get("story_outline"):
        return None
    shot_ids = [shot["id"] for shot in shots]
    bindings = (
        await _rows(session, _binding_table, _binding_table.c.shot_id.in_(shot_ids)) if shot_ids else []
    )
    return {
        "version": SNAPSHOT_VERSION,
        "captured_at": utcnow().isoformat(),
        "project": {field: project.get(field) for field in PROJECT_FIELDS},
        "characters": characters,
        "shots": shots,
        "bindings": bindings,
    }


def _content_fingerprint(project: dict[str, Any], characters: list[dict], shots: list[dict], bindings: list[dict]) -> str:
    def strip(row: dict[str, Any]) -> dict[str, Any]:
        return {k: v for k, v in row.items() if k not in {"revision", "updated_at"}}

    payload = {
        "project": {field: project.get(field) for field in PROJECT_FIELDS},
        "characters": sorted((strip(r) for r in characters), key=lambda r: r["id"]),
        "shots": sorted((strip(r) for r in shots), key=lambda r: r["id"]),
        "bindings": sorted((r["shot_id"], r["character_id"]) for r in bindings),
    }
    return hashlib.sha256(json.dumps(payload, sort_keys=True, default=str).encode()).hexdigest()


async def project_matches_version(session: AsyncSession, project_id: int, snapshot: dict[str, Any]) -> bool:
    current = await capture_project_version(session, project_id)
    if current is None:
        return False
    return _content_fingerprint(
        current["project"], current["characters"], current["shots"], current["bindings"]
    ) == _content_fingerprint(
        snapshot.get("project") or {},
        list(snapshot.get("characters") or []),
        list(snapshot.get("shots") or []),
        list(snapshot.get("bindings") or []),
    )


def is_valid_snapshot(snapshot: Any) -> bool:
    return (
        isinstance(snapshot, dict)
        and snapshot.get("version") == SNAPSHOT_VERSION
        and isinstance(snapshot.get("project"), dict)
        and isinstance(snapshot.get("characters"), list)
        and isinstance(snapshot.get("shots"), list)
    )


async def restore_project_version(session: AsyncSession, project_id: int, snapshot: dict[str, Any]) -> bool:
    """Write a captured version back. Returns False when nothing had changed.

    Does not commit; the caller commits together with its own bookkeeping.
    """
    if not is_valid_snapshot(snapshot):
        raise ValueError("previous version snapshot is invalid")
    if await project_matches_version(session, project_id, snapshot):
        return False

    current_char_rev = {
        row.id: row.revision
        for row in (
            await session.execute(
                select(_character_table.c.id, _character_table.c.revision).where(
                    _character_table.c.project_id == project_id
                )
            )
        ).all()
    }
    current_shot_rev = {
        row.id: row.revision
        for row in (
            await session.execute(
                select(_shot_table.c.id, _shot_table.c.revision).where(_shot_table.c.project_id == project_id)
            )
        ).all()
    }
    shot_ids = list(current_shot_rev)
    if shot_ids:
        await session.execute(delete(_binding_table).where(_binding_table.c.shot_id.in_(shot_ids)))
    await session.execute(delete(_shot_table).where(_shot_table.c.project_id == project_id))
    await session.execute(delete(_character_table).where(_character_table.c.project_id == project_id))

    now = utcnow()
    for raw in snapshot["characters"]:
        row = _restore_row(_character_table, raw)
        row["project_id"] = project_id
        # Bump past anything a client may have cached for this id.
        row["revision"] = max(int(row.get("revision") or 1), current_char_rev.get(row.get("id"), 0)) + 1
        if "updated_at" in _character_table.c:
            row["updated_at"] = now
        await session.execute(insert(_character_table).values(**row))
    for raw in snapshot["shots"]:
        row = _restore_row(_shot_table, raw)
        row["project_id"] = project_id
        row["revision"] = max(int(row.get("revision") or 1), current_shot_rev.get(row.get("id"), 0)) + 1
        if "updated_at" in _shot_table.c:
            row["updated_at"] = now
        await session.execute(insert(_shot_table).values(**row))
    restored_shot_ids = {raw.get("id") for raw in snapshot["shots"]}
    restored_char_ids = {raw.get("id") for raw in snapshot["characters"]}
    for raw in snapshot.get("bindings") or []:
        if raw.get("shot_id") in restored_shot_ids and raw.get("character_id") in restored_char_ids:
            await session.execute(insert(_binding_table).values(**_restore_row(_binding_table, raw)))

    project_values = {
        field: snapshot["project"].get(field) for field in PROJECT_FIELDS if field in snapshot["project"]
    }
    await session.execute(
        update(_project_table)
        .where(_project_table.c.id == project_id)
        .values(**project_values, revision=_project_table.c.revision + 1, updated_at=now)
    )
    return True


async def count_project_entities(session: AsyncSession, project_id: int) -> tuple[int, int]:
    characters = await session.execute(
        select(func.count()).select_from(_character_table).where(_character_table.c.project_id == project_id)
    )
    shots = await session.execute(
        select(func.count()).select_from(_shot_table).where(_shot_table.c.project_id == project_id)
    )
    return int(characters.scalar() or 0), int(shots.scalar() or 0)
