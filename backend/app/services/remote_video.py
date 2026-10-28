from __future__ import annotations

import asyncio
import http.client
import ipaddress
import socket
import ssl
import threading
import time
from pathlib import Path
from urllib.parse import urljoin, urlsplit

MAX_VIDEO_BYTES = 1024 * 1024 * 1024
MAX_REDIRECTS = 5
MAX_DOWNLOAD_SECONDS = 120


def _resolve(host: str, port: int, timeout: float) -> list:
    """getaddrinfo has no timeout of its own; bound it so DNS cannot outlive the download budget."""
    result: dict[str, object] = {}

    def lookup() -> None:
        try:
            result["addresses"] = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
        except Exception as exc:  # noqa: BLE001 - re-raised in the caller thread
            result["error"] = exc

    thread = threading.Thread(target=lookup, daemon=True)
    thread.start()
    thread.join(timeout)
    if thread.is_alive():
        raise TimeoutError("Video host DNS lookup timed out")
    if "error" in result:
        raise result["error"]  # type: ignore[misc]
    return result["addresses"]  # type: ignore[return-value]


def _connection(url: str, timeout: float) -> tuple[http.client.HTTPConnection, str]:
    parsed = urlsplit(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError("Video URL must be public HTTP or HTTPS")
    port = parsed.port or (443 if parsed.scheme == "https" else 80)
    addresses = _resolve(parsed.hostname, port, timeout)
    ips = {item[4][0] for item in addresses}
    if not ips or any(not ipaddress.ip_address(ip).is_global for ip in ips):
        raise ValueError("Video URL must resolve only to public IP addresses")
    ip = next(iter(ips))

    class PinnedHTTPConnection(http.client.HTTPConnection):
        def connect(self) -> None:
            sock = socket.create_connection((ip, port), timeout)
            self.sock = sock

    class PinnedHTTPSConnection(http.client.HTTPSConnection):
        def connect(self) -> None:
            sock = socket.create_connection((ip, port), timeout)
            self.sock = self._context.wrap_socket(sock, server_hostname=parsed.hostname)

    connection: http.client.HTTPConnection
    if parsed.scheme == "https":
        connection = PinnedHTTPSConnection(parsed.hostname, port, timeout=timeout, context=ssl.create_default_context())
    else:
        connection = PinnedHTTPConnection(parsed.hostname, port, timeout=timeout)
    target = parsed.path or "/"
    if parsed.query:
        target += f"?{parsed.query}"
    return connection, target


def download_video(
    url: str,
    destination: Path,
    max_bytes: int = MAX_VIDEO_BYTES,
    stop_event: threading.Event | None = None,
) -> bool:
    deadline = time.monotonic() + MAX_DOWNLOAD_SECONDS
    current = url
    for redirect in range(MAX_REDIRECTS + 1):
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise TimeoutError("Video download timed out")
        connection, target = _connection(current, min(remaining, 30))
        try:
            if stop_event is not None and stop_event.is_set():
                raise InterruptedError("Video download cancelled")
            connection.request("GET", target, headers={"Accept-Encoding": "identity"})
            response = connection.getresponse()
            if response.status in {301, 302, 303, 307, 308}:
                location = response.getheader("Location")
                if not location:
                    raise ValueError("Video redirect has no destination")
                if redirect == MAX_REDIRECTS:
                    raise ValueError("Too many video redirects")
                current = urljoin(current, location)
                continue
            if response.status != 200:
                raise ValueError(f"Video server returned HTTP {response.status}")
            length = response.getheader("Content-Length")
            if length and int(length) > max_bytes:
                raise ValueError("Video exceeds download size limit")
            size = 0
            created = False
            try:
                with destination.open("xb") as output:
                    created = True
                    while True:
                        if stop_event is not None and stop_event.is_set():
                            raise InterruptedError("Video download cancelled")
                        chunk = response.read(64 * 1024)
                        if not chunk:
                            break
                        size += len(chunk)
                        if size > max_bytes:
                            raise ValueError("Video exceeds download size limit")
                        if time.monotonic() > deadline:
                            raise TimeoutError("Video download timed out")
                        output.write(chunk)
            except BaseException:
                if created:
                    destination.unlink(missing_ok=True)
                raise
            return created
        finally:
            connection.close()
    raise ValueError("Too many video redirects")


async def download_video_async(
    url: str, destination: Path, max_bytes: int = MAX_VIDEO_BYTES
) -> None:
    stop_event = threading.Event()
    task = asyncio.create_task(
        asyncio.to_thread(download_video, url, destination, max_bytes, stop_event)
    )
    try:
        await asyncio.shield(task)
    except asyncio.CancelledError:
        stop_event.set()
        try:
            created = await asyncio.shield(task)
        except Exception:
            pass
        else:
            if created:
                destination.unlink(missing_ok=True)
        raise


__all__ = ["download_video", "download_video_async"]
