"""Record whether the vision critic actually checked a shot.

A shot whose critic call could not run (no vision model configured, the
vision server down or out of memory) used to look exactly like a shot that
passed. `shot.review_status` keeps the outcome — passed / failed / unchecked —
and `shot.review_note` the reason, so the canvas can say 「未检查」 instead of
staying silent. Both are cleared when a new keyframe or clip replaces the one
that was judged.

Revision ID: 0031_shot_review_status
Revises: 0030_run_timing
"""
import sqlalchemy as sa
from sqlalchemy import inspect

from alembic import op

revision = "0031_shot_review_status"
down_revision = "0030_run_timing"
branch_labels = None
depends_on = None


def _columns(table: str) -> set[str]:
    return {column["name"] for column in inspect(op.get_bind()).get_columns(table)}


def upgrade() -> None:
    existing = _columns("shot")
    with op.batch_alter_table("shot") as batch:
        if "review_status" not in existing:
            batch.add_column(sa.Column("review_status", sa.String(), nullable=True))
        if "review_note" not in existing:
            batch.add_column(sa.Column("review_note", sa.String(), nullable=True))


def downgrade() -> None:
    existing = _columns("shot")
    with op.batch_alter_table("shot") as batch:
        if "review_note" in existing:
            batch.drop_column("review_note")
        if "review_status" in existing:
            batch.drop_column("review_status")
