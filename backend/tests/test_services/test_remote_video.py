from __future__ import annotations

import socket
import threading
import time

import pytest

from app.services import remote_video


def test_dns_lookup_cannot_outlive_the_download_budget(monkeypatch, tmp_path):
    release = threading.Event()

    def stuck_getaddrinfo(*_args, **_kwargs):
        release.wait(5)
        raise socket.gaierror("released")

    monkeypatch.setattr(remote_video.socket, "getaddrinfo", stuck_getaddrinfo)
    monkeypatch.setattr(remote_video, "MAX_DOWNLOAD_SECONDS", 0.2)
    started = time.monotonic()
    try:
        with pytest.raises(TimeoutError, match="DNS lookup timed out"):
            remote_video.download_video("http://video.example/a.mp4", tmp_path / "a.mp4")
    finally:
        release.set()
    assert time.monotonic() - started < 2


def test_dns_errors_and_private_addresses_still_surface(monkeypatch):
    def failing(*_args, **_kwargs):
        raise socket.gaierror("no such host")

    monkeypatch.setattr(remote_video.socket, "getaddrinfo", failing)
    with pytest.raises(socket.gaierror):
        remote_video._connection("http://missing.example/a.mp4", 1)

    monkeypatch.setattr(
        remote_video.socket,
        "getaddrinfo",
        lambda *_a, **_k: [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("10.0.0.1", 80))],
    )
    with pytest.raises(ValueError, match="public IP"):
        remote_video._connection("http://internal.example/a.mp4", 1)
