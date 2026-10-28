"""Create the registry for managed media objects.

This table records media identity and its static-root-relative path. It does not
claim references or delete files; those are intentionally outside this migration.

Revision ID: 0028_managed_media_registry
Revises: 0027_drop_legacy_run_stage
"""
from sqlalchemy import inspect

from alembic import op

revision = "0028_managed_media_registry"
down_revision = "0027_drop_legacy_run_stage"
branch_labels = None
depends_on = None


def _matches_existing_schema(bind) -> bool:
    inspector = inspect(bind)
    columns = {column["name"]: column for column in inspector.get_columns("media_object")}
    expected = {"id", "namespace", "relative_path", "created_at"}
    if set(columns) != expected:
        return False
    if any(
        str(column["type"]).upper() != "TEXT" or column["nullable"]
        for column in columns.values()
    ):
        return False
    if "strftime('%Y-%m-%dT%H:%M:%fZ','now')" not in (columns["created_at"]["default"] or ""):
        return False
    if inspector.get_pk_constraint("media_object").get("constrained_columns") != ["id"] or not any(
        constraint.get("column_names") == ["relative_path"]
        for constraint in inspector.get_unique_constraints("media_object")
    ):
        return False
    checks = {
        check["name"]: "".join(check["sqltext"].split()).lower()
        for check in inspector.get_check_constraints("media_object")
    }
    return checks.get("ck_media_object_namespace") == "namespace='managed-v1'" and checks.get(
        "ck_media_object_relative_path"
    ) == (
        "substr(relative_path,1,11)='managed-v1/'andlength(relative_path)>11"
        "andsubstr(relative_path,12)<>'.'andinstr(substr(relative_path,12),'/')=0"
        "andinstr(relative_path,'..')=0andinstr(relative_path,char(92))=0"
    )


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if inspector.has_table("media_object"):
        if not _matches_existing_schema(bind):
            raise RuntimeError(
                "existing media_object table cannot be verified against the 0028 managed media schema; "
                "inspect and resolve it manually before upgrading"
            )
    else:
        op.execute(
            """
            CREATE TABLE media_object (
                id TEXT PRIMARY KEY NOT NULL,
                namespace TEXT NOT NULL,
                relative_path TEXT NOT NULL UNIQUE,
                created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
                CONSTRAINT ck_media_object_namespace CHECK (namespace = 'managed-v1'),
                CONSTRAINT ck_media_object_relative_path CHECK (
                    substr(relative_path, 1, 11) = 'managed-v1/'
                    AND length(relative_path) > 11
                    AND substr(relative_path, 12) <> '.'
                    AND instr(substr(relative_path, 12), '/') = 0
                    AND instr(relative_path, '..') = 0
                    AND instr(relative_path, char(92)) = 0
                )
            )
            """
        )
    index_name = "ix_media_object_namespace_created_at"
    existing = bind.exec_driver_sql(
        "SELECT type, tbl_name FROM sqlite_master WHERE name = ?",
        (index_name,),
    ).first()
    if existing:
        indexes = {index["name"]: index for index in inspect(bind).get_indexes("media_object")}
        index = indexes.get(index_name)
        if (
            existing["type"] != "index"
            or existing["tbl_name"] != "media_object"
            or index is None
            or index.get("column_names") != ["namespace", "created_at"]
        ):
            raise RuntimeError(
                f"existing {index_name} does not match media_object(namespace, created_at); "
                "inspect and resolve it manually before upgrading"
            )
    else:
        op.execute(
            "CREATE INDEX ix_media_object_namespace_created_at "
            "ON media_object (namespace, created_at)"
        )


def downgrade() -> None:
    bind = op.get_bind()
    if inspect(bind).has_table("media_object") and bind.exec_driver_sql(
        "SELECT EXISTS (SELECT 1 FROM media_object LIMIT 1)"
    ).scalar():
        raise RuntimeError("cannot downgrade 0028 while media_object contains registered records")
    op.execute("DROP TABLE IF EXISTS media_object")
