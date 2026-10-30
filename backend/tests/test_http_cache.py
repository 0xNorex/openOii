from __future__ import annotations

import json

import httpx
import pytest
from starlette.applications import Starlette
from starlette.responses import JSONResponse, PlainTextResponse, StreamingResponse
from starlette.routing import Mount, Route

from app.http_cache import JsonGZipMiddleware, MediaStaticFiles
from app.main import _tail_poll_interval

BIG = {"items": [{"id": i, "title": "分镜" * 20} for i in range(50)]}


def _app(static_dir) -> Starlette:
    async def big(_):
        return JSONResponse(BIG)

    async def small(_):
        return JSONResponse({"ok": True})

    async def text(_):
        return PlainTextResponse("x" * 5000)

    async def stream(_):
        async def gen():
            yield b'{"a":' + b"1" * 2000
            yield b"}"

        return StreamingResponse(gen(), media_type="application/json")

    app = Starlette(
        routes=[
            Route("/big", big),
            Route("/small", small),
            Route("/text", text),
            Route("/stream", stream),
            Mount("/static", MediaStaticFiles(directory=str(static_dir))),
        ]
    )
    app.add_middleware(JsonGZipMiddleware)
    return app


@pytest.fixture
def static_dir(tmp_path):
    (tmp_path / "managed-v1").mkdir()
    (tmp_path / "managed-v1" / "a.png").write_bytes(b"png")
    (tmp_path / "legacy.png").write_bytes(b"png")
    return tmp_path


async def _get(app, path, **headers):
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t") as c:
        return await c.get(path, headers=headers)


@pytest.mark.asyncio
async def test_large_json_is_gzipped(static_dir):
    r = await _get(_app(static_dir), "/big", **{"accept-encoding": "gzip"})
    assert r.headers["content-encoding"] == "gzip"
    assert "Accept-Encoding" in r.headers["vary"]
    assert int(r.headers["content-length"]) < len(json.dumps(BIG, ensure_ascii=False).encode())
    assert r.json() == BIG  # httpx transparently decodes


@pytest.mark.asyncio
@pytest.mark.parametrize("path", ["/small", "/text", "/stream"])
async def test_small_non_json_and_streaming_pass_through(static_dir, path):
    r = await _get(_app(static_dir), path, **{"accept-encoding": "gzip"})
    assert "content-encoding" not in r.headers


@pytest.mark.asyncio
async def test_no_gzip_without_accept_encoding(static_dir):
    r = await _get(_app(static_dir), "/big", **{"accept-encoding": "identity"})
    assert "content-encoding" not in r.headers
    assert r.json() == BIG


@pytest.mark.asyncio
async def test_managed_media_is_immutable_legacy_revalidates(static_dir):
    app = _app(static_dir)
    managed = await _get(app, "/static/managed-v1/a.png")
    assert managed.headers["cache-control"] == "public, max-age=31536000, immutable"
    legacy = await _get(app, "/static/legacy.png")
    assert "cache-control" not in legacy.headers
    assert "etag" in legacy.headers


def test_tail_poll_backs_off_when_idle():
    assert _tail_poll_interval(0) == 0.25
    assert _tail_poll_interval(7) == 0.25
    assert _tail_poll_interval(8) == 1.0
    assert _tail_poll_interval(100) == 1.0
