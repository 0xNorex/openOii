"""Per-character voice and per-project dubbing / subtitle / music switches.

`character.voice` pins the TTS voice a character speaks with (empty = pick one
from the description, as before). `project.media_options` holds the project's
own choice for {tts, subtitles, bgm}; a missing key or null value follows the
default in settings.

Revision ID: 0032_media_options
Revises: 0031_shot_review_status
"""
import sqlalchemy as sa
from sqlalchemy import inspect

from alembic import op

revision = "0032_media_options"
down_revision = "0031_shot_review_status"
branch_labels = None
depends_on = None


def _columns(table: str) -> set[str]:
    return {column["name"] for column in inspect(op.get_bind()).get_columns(table)}


def upgrade() -> None:
    if "voice" not in _columns("character"):
        with op.batch_alter_table("character") as batch:
            batch.add_column(sa.Column("voice", sa.String(), nullable=True))
    if "media_options" not in _columns("project"):
        with op.batch_alter_table("project") as batch:
            batch.add_column(sa.Column("media_options", sa.JSON(), nullable=True))


def downgrade() -> None:
    if "media_options" in _columns("project"):
        with op.batch_alter_table("project") as batch:
            batch.drop_column("media_options")
    if "voice" in _columns("character"):
        with op.batch_alter_table("character") as batch:
            batch.drop_column("voice")
