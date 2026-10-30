"""HTTP transport helpers: JSON compression and cache headers for immutable media."""

from __future__ import annotations

import gzip

from fastapi.staticfiles import StaticFiles
from starlette.datastructures import Headers, MutableHeaders
from starlette.responses import Response
from starlette.types import ASGIApp, Message, Receive, Scope, Send

_JSON_MIN_BYTES = 1024


class JsonGZipMiddleware:
    """Gzip single-body ``application/json`` responses only.

    Starlette's GZipMiddleware compresses every content type, which would
    re-compress media, break byte ranges on video and buffer file downloads.
    API JSON (project lists, message feeds) shrinks ~5-8x; everything else —
    static files, streams, websockets — passes through untouched.
    """

    def __init__(
        self, app: ASGIApp, minimum_size: int = _JSON_MIN_BYTES, compresslevel: int = 6
    ) -> None:
        self.app = app
        self.minimum_size = minimum_size
        self.compresslevel = compresslevel

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or "gzip" not in Headers(scope=scope).get("accept-encoding", ""):
            await self.app(scope, receive, send)
            return

        start: Message | None = None
        passthrough = False

        async def send_wrapper(message: Message) -> None:
            nonlocal start, passthrough
            if message["type"] == "http.response.start":
                headers = Headers(raw=message["headers"])
                passthrough = (
                    "content-encoding" in headers
                    or "content-range" in headers
                    or not headers.get("content-type", "").startswith("application/json")
                )
                if passthrough:
                    await send(message)
                else:
                    start = message
                return
            if message["type"] != "http.response.body" or passthrough or start is None:
                await send(message)
                return
            body = message.get("body", b"")
            if message.get("more_body", False) or len(body) < self.minimum_size:
                # Streaming or tiny body: send as-is.
                await send(start)
                start = None
                passthrough = True
                await send(message)
                return
            compressed = gzip.compress(body, compresslevel=self.compresslevel)
            headers = MutableHeaders(raw=start["headers"])
            headers.add_vary_header("Accept-Encoding")
            headers["Content-Encoding"] = "gzip"
            headers["Content-Length"] = str(len(compressed))
            await send(start)
            start = None
            await send({"type": "http.response.body", "body": compressed, "more_body": False})

        await self.app(scope, receive, send_wrapper)


class MediaStaticFiles(StaticFiles):
    """StaticFiles with long-lived caching for content-addressed media.

    ``managed-v1/`` files are published once under a fresh UUID name and never
    rewritten (the engine writes with ``wx`` / hard links), so browsers may keep
    them forever. Other folders keep the default ETag/Last-Modified revalidation.
    """

    async def get_response(self, path: str, scope: Scope) -> Response:
        response = await super().get_response(path, scope)
        if path.replace("\\", "/").startswith("managed-v1/") and response.status_code in (
            200,
            206,
            304,
        ):
            response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        return response
