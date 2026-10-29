"""Add agentrun.gate_feedback: a "request changes" decision at an approval gate.

`confirm_requested` can only say "approve". Feedback sent while a run waits at a
gate used to ride on that same bit, so the engine treated it as an approval and
moved on with the user's notes unread. The gateway now writes the feedback here
and the engine consumes it: it redoes the gate's stage with the feedback and
returns to the same gate.

Revision ID: 0029_agentrun_gate_feedback
Revises: 0028_managed_media_registry
"""
import sqlalchemy as sa
from sqlalchemy import inspect

from alembic import op

revision = "0029_agentrun_gate_feedback"
down_revision = "0028_managed_media_registry"
branch_labels = None
depends_on = None


def upgrade() -> None:
    columns = {column["name"] for column in inspect(op.get_bind()).get_columns("agentrun")}
    if "gate_feedback" not in columns:
        with op.batch_alter_table("agentrun") as batch:
            batch.add_column(sa.Column("gate_feedback", sa.JSON(), nullable=True))


def downgrade() -> None:
    columns = {column["name"] for column in inspect(op.get_bind()).get_columns("agentrun")}
    if "gate_feedback" in columns:
        with op.batch_alter_table("agentrun") as batch:
            batch.drop_column("gate_feedback")
