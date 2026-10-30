"""Wake WS event tailers when the shared SQLite file is written.

The engine (a separate Node process) appends ``engine_run_events`` rows to the
same WAL-mode SQLite file the backend reads. SQLite has no cross-process
notify, so instead of every WS connection polling the table 1-4x/s, one file
watcher (inotify via ``watchfiles``) bumps a generation counter whenever the
database or its ``-wal`` file changes; tailers query only after a bump and fall
back to a slow poll if the watcher is unavailable or stops.
"""

from __future__ import annotations

import asyncio
import logging
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from sqlalchemy.engine import URL

logger = logging.getLogger(__name__)

# Coalesce bursts (an llm_stream append + compaction is several page writes).
_DEBOUNCE_MS = 40
_STEP_MS = 20


class DbChangeNotifier:
    def __init__(self) -> None:
        self.generation = 0
        self._cond: asyncio.Condition | None = None
        self._task: asyncio.Task[None] | None = None
        self._stop: asyncio.Event | None = None
        self._active = False

    @property
    def active(self) -> bool:
        return self._active

    def start(self, db_path: Path) -> None:
        if self._task is not None:
            return
        try:
            from watchfiles import awatch
        except ImportError:  # pragma: no cover - uvicorn[standard] ships it
            logger.info("db change notifier: watchfiles unavailable; tail stays on polling")
            return
        self._cond = asyncio.Condition()
        self._stop = asyncio.Event()
        names = {db_path.name, f"{db_path.name}-wal"}

        def _only_db(_change: object, path: str) -> bool:
            return Path(path).name in names

        async def _run() -> None:
            assert self._stop is not None
            try:
                self._active = True
                async for _changes in awatch(
                    db_path.parent,
                    watch_filter=_only_db,
                    debounce=_DEBOUNCE_MS,
                    step=_STEP_MS,
                    recursive=False,
                    stop_event=self._stop,
                ):
                    await self._bump()
            except Exception:  # noqa: BLE001
                logger.exception("db change notifier stopped; tail falls back to polling")
            finally:
                self._active = False
                await self._bump()

        self._task = asyncio.create_task(_run(), name="db-change-notifier")

    async def _bump(self) -> None:
        if self._cond is None:
            return
        async with self._cond:
            self.generation += 1
            self._cond.notify_all()

    async def wait_for_change(self, since: int, timeout: float) -> bool:
        """Wait until ``generation`` moves past ``since``; False on timeout."""
        if self._cond is None:
            await asyncio.sleep(timeout)
            return False
        try:
            async with self._cond:
                await asyncio.wait_for(
                    self._cond.wait_for(lambda: self.generation != since), timeout
                )
            return True
        except TimeoutError:
            return False

    async def stop(self) -> None:
        if self._stop is not None:
            self._stop.set()
        if self._task is not None:
            self._task.cancel()
            try:
                await self._task
            except (asyncio.CancelledError, Exception):  # noqa: BLE001
                pass
        self._task = None
        self._active = False


db_change_notifier = DbChangeNotifier()


def sqlite_db_path(database_url: "str | URL") -> Path | None:
    """File path for a ``sqlite`` URL; None for memory/other databases."""
    from sqlalchemy.engine import make_url

    try:
        url = make_url(database_url)
    except Exception:  # noqa: BLE001
        return None
    if not url.get_backend_name().startswith("sqlite"):
        return None
    db_file = url.database
    if not db_file or db_file == ":memory:" or db_file.startswith("file:"):
        return None
    path = Path(db_file)
    if not path.is_absolute():
        path = Path.cwd() / path
    return path
