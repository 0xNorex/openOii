"""Record when a run and each of its stages actually started and finished.

`agentrun.created_at` is when the row was queued, and `updated_at` moves on
every progress write, so neither says how long a run has been working. The
engine now stamps `agentrun.started_at` once, when execution begins, and
`engine_stage_attempts.finished_at` when an attempt ends. Elapsed time and the
remaining-time estimate (from earlier runs' stage durations) are read from them.

Existing rows are backfilled: a run starts at its first stage attempt (or its
creation), and a finished attempt ended at its last update.

Revision ID: 0030_run_timing
Revises: 0029_agentrun_gate_feedback
"""
import sqlalchemy as sa
from sqlalchemy import inspect

from alembic import op

revision = "0030_run_timing"
down_revision = "0029_agentrun_gate_feedback"
branch_labels = None
depends_on = None

_TERMINAL = "('succeeded', 'failed', 'cancelled')"


def _columns(table: str) -> set[str]:
    return {column["name"] for column in inspect(op.get_bind()).get_columns(table)}


def upgrade() -> None:
    tables = set(inspect(op.get_bind()).get_table_names())
    if "started_at" not in _columns("agentrun"):
        with op.batch_alter_table("agentrun") as batch:
            batch.add_column(sa.Column("started_at", sa.DateTime(), nullable=True))
    if "engine_stage_attempts" in tables and "finished_at" not in _columns("engine_stage_attempts"):
        with op.batch_alter_table("engine_stage_attempts") as batch:
            batch.add_column(sa.Column("finished_at", sa.String(), nullable=True))
        op.execute(
            f"UPDATE engine_stage_attempts SET finished_at = updated_at "
            f"WHERE finished_at IS NULL AND status IN {_TERMINAL}"
        )
    # Same naive-UTC text the backend writes ('YYYY-MM-DD HH:MM:SS.ffffff').
    first_attempt = (
        "(SELECT replace(replace(MIN(a.started_at), 'T', ' '), 'Z', '') "
        "FROM engine_stage_attempts a WHERE a.run_id = agentrun.id)"
        if "engine_stage_attempts" in tables
        else "NULL"
    )
    op.execute(
        f"UPDATE agentrun SET started_at = COALESCE({first_attempt}, created_at) "
        f"WHERE started_at IS NULL AND status <> 'queued'"
    )


def downgrade() -> None:
    if "finished_at" in _columns("engine_stage_attempts"):
        with op.batch_alter_table("engine_stage_attempts") as batch:
            batch.drop_column("finished_at")
    if "started_at" in _columns("agentrun"):
        with op.batch_alter_table("agentrun") as batch:
            batch.drop_column("started_at")
