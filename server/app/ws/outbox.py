"""One socket's outbound frames: a bounded queue and the one task that writes it.

Every frame for a socket goes through its ``Outbox``: broadcasts, the handler's own replies
(``answer_ack``, ``error``, ``pong``) and the close, so they reach the client in the order
they were put. ``put`` and ``close`` never wait. Only the writer task awaits the socket, so
a client that stops reading holds up nobody but itself: once its queue is full, or one of
its sends times out, the writer closes it with 1011 and ``on_failed`` detaches it.
"""

import asyncio
import json
import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any, Protocol

from app import metrics

log = logging.getLogger("app.ws")

# Seconds a single send or close may take before that socket counts as dead.
SEND_TIMEOUT = 10.0
# Frames a socket may have waiting. A whole game's worth of broadcasts to a healthy client
# drains long before this; a client that falls this far behind is not coming back.
QUEUE_LIMIT = 256
CLOSE_SEND_FAILED = 1011
# The close frame's reason is at most 123 bytes.
_REASON_MAX = 120


class Socket(Protocol):
    async def send_text(self, data: str) -> None: ...
    async def close(self, code: int = 1000, reason: str | None = None) -> None: ...


class Frame:
    """One server frame, serialised the first time a socket sends it and shared from then on.

    A broadcast puts the same ``Frame`` on every outbox, so a room of fifty dumps it once
    rather than fifty times, and outside the room lock.
    """

    __slots__ = ("_text", "message")

    def __init__(self, message: dict[str, Any]) -> None:
        self.message = message
        self._text: str | None = None

    @property
    def text(self) -> str:
        """The frame as sent, spelled as Starlette's ``send_json`` would spell it."""
        if self._text is None:
            self._text = json.dumps(self.message, separators=(",", ":"), ensure_ascii=False)
        return self._text


@dataclass(frozen=True, slots=True)
class _Close:
    code: int
    reason: str


async def send(ws: Socket, message: Frame | dict[str, Any]) -> bool:
    """Send one frame; ``False`` if the socket is gone, refused it or took too long."""
    frame = message if isinstance(message, Frame) else Frame(message)
    try:
        async with asyncio.timeout(SEND_TIMEOUT):
            await ws.send_text(frame.text)
    except Exception as exc:  # closed from either side, transport error, timeout
        log.info("dropping socket after failed send: %r", exc)
        return False
    return True


async def close(ws: Socket, code: int, reason: str) -> None:
    """Best-effort close of a socket we are done with. Never raises, never hangs."""
    try:
        async with asyncio.timeout(SEND_TIMEOUT):
            await ws.close(code=code, reason=reason[:_REASON_MAX])
    except Exception as exc:  # already closed, client gone, or stalled: all the same to us
        log.debug("closing socket with %d failed: %r", code, exc)


class Outbox:
    """The queue in front of one socket. Create it inside a running event loop."""

    def __init__(
        self,
        ws: Socket,
        on_failed: Callable[[], Awaitable[None]],
        limit: int = QUEUE_LIMIT,
    ) -> None:
        self.ws = ws
        self._on_failed = on_failed
        self._limit = limit
        # Unbounded underneath so a close always fits; ``put`` holds frames to ``limit``.
        self._queue: asyncio.Queue[Frame | _Close] = asyncio.Queue()
        self._closing = False
        self._task = asyncio.create_task(self._write(), name="outbox")

    @property
    def closing(self) -> bool:
        """A close is queued or done: nothing put from now on is sent."""
        return self._closing

    def put(self, message: Frame | dict[str, Any]) -> bool:
        """Queue a frame. ``False`` if it will never be sent."""
        if self._closing:
            return False
        if self._queue.qsize() >= self._limit:
            self._give_up("send queue full")
            return False
        self._queue.put_nowait(message if isinstance(message, Frame) else Frame(message))
        return True

    def close(self, code: int, reason: str) -> bool:
        """Close the socket once everything already queued has gone. The first close wins."""
        if self._closing:
            return False
        self._closing = True
        self._queue.put_nowait(_Close(code, reason))
        return True

    async def finished(self) -> None:
        """Wait until the writer has stopped, after a close or a failure."""
        while True:
            task = self._task
            await asyncio.wait([task])
            if task is self._task:
                return

    def cancel(self) -> None:
        """Stop writing now, whatever is queued. For shutdown."""
        self._closing = True
        self._task.cancel()

    async def _write(self) -> None:
        while True:
            item = await self._queue.get()
            if isinstance(item, _Close):
                await close(self.ws, item.code, item.reason)
                return
            if not await send(self.ws, item):
                break
        self._closing = True
        await self._fail("send failed")

    def _give_up(self, reason: str) -> None:
        log.info("dropping socket: %s", reason)
        self._closing = True
        # The writer may be stuck in a send that will not finish; it is not waited for.
        self._task.cancel()
        self._task = asyncio.create_task(self._fail(reason), name="outbox-failed")

    async def _fail(self, reason: str) -> None:
        metrics.WS_DISCONNECTS.labels(reason="send_failed").inc()
        # Together: a close to a client that has stopped reading can take ``SEND_TIMEOUT``,
        # and the room should hear it has gone now, not then.
        await asyncio.gather(close(self.ws, CLOSE_SEND_FAILED, reason), self._detach())

    async def _detach(self) -> None:
        try:
            await self._on_failed()
        except Exception:
            log.exception("detaching a failed socket raised")
