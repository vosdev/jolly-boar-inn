"""``GET /ws/{code}``: parse frames, authenticate the first one, dispatch to ``RoomManager``.

Close codes (section 3): ``4001`` bad ``hello``, ``4004`` unknown or expired room, ``4008``
any protocol error after the handshake, each after a single ``error`` message where the
protocol has a code for it. ``1008`` for no ``hello`` within ``HELLO_TIMEOUT`` or a socket
over its message rate, and ``1009`` for a frame over ``MAX_FRAME``: the client reconnects
after both. ``4000`` (replaced by a newer socket) and ``1012`` (room left memory) come from
the manager.

Every message after the handshake is one ``RoomManager`` call. A call that raises
``ApiError`` becomes a single ``error`` frame and the socket stays open: a rejected
message (``not_admin``, ``not_open``, ``already_answered``) is not a protocol error.
Only a frame we cannot parse closes the socket.

Commands other than ``answer`` have no direct reply. What they did reaches every client,
the sender included, through the broadcasts the manager sends.
"""

import asyncio
import json
import logging
import time
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any, get_args

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import ValidationError

from app.errors import ApiError
from app.rooms.state import (
    SEND_TIMEOUT,
    BadSession,
    Player,
    RoomExpired,
    RoomManager,
    RoomNotFound,
)
from app.ws import protocol
from app.ws.protocol import ErrorCode

log = logging.getLogger("app.ws")
router = APIRouter()

CLOSE_BAD_HELLO = 4001
CLOSE_UNKNOWN_ROOM = 4004
CLOSE_PROTOCOL_ERROR = 4008
CLOSE_POLICY = 1008
CLOSE_TOO_BIG = 1009
CLOSE_INTERNAL = 1011
# uvicorn's ``--ws-max-size`` refuses bigger frames before they reach us. This repeats it
# for any other launcher, and so that ``json.loads`` never sees one: a 16 MiB array of
# empty objects costs hundreds of MB to parse. The largest real frame is well under 1 KB.
MAX_FRAME = 65536
# Until ``hello`` the socket belongs to nobody, so nothing else would ever close it.
HELLO_TIMEOUT = 10.0
# Per socket, after the handshake. A player tapping as fast as they can stays far below.
RATE_PER_SECOND = 10.0
RATE_BURST = 20
# The ``ApiError.code`` values that are also websocket error codes (section 3). Anything
# else a manager call raises is a room that cannot take the message: ``bad_state``.
_ERROR_CODES: frozenset[str] = frozenset(get_args(ErrorCode))


class BadFrame(Exception):
    """Not a JSON text frame."""


class FrameTooBig(Exception):
    """A text frame over ``MAX_FRAME``."""


class TokenBucket:
    """``rate`` tokens a second, holding at most ``burst``; each message takes one."""

    def __init__(
        self, rate: float, burst: int, clock: Callable[[], float] = time.monotonic
    ) -> None:
        self.rate = rate
        self.burst = burst
        self.clock = clock
        self.tokens = float(burst)
        self.updated = clock()

    def take(self) -> bool:
        """Spend one token; ``False`` if there was none left."""
        now = self.clock()
        self.tokens = min(self.burst, self.tokens + (now - self.updated) * self.rate)
        self.updated = now
        if self.tokens < 1:
            return False
        self.tokens -= 1
        return True


async def _next_frame(ws: WebSocket) -> Any:
    """The next decoded JSON text frame. ``WebSocketDisconnect`` when the client leaves.

    Uses the raw ASGI ``receive`` rather than ``receive_json`` so that a socket the
    manager already closed (4000, 1012) still reads the client's disconnect cleanly.
    """
    message = await ws.receive()
    if message["type"] == "websocket.disconnect":
        raise WebSocketDisconnect(message.get("code", 1000), message.get("reason"))
    text = message.get("text")
    if text is None:
        raise BadFrame("only JSON text frames are accepted")
    if len(text) > MAX_FRAME:
        raise FrameTooBig
    try:
        return json.loads(text)
    except ValueError:
        raise BadFrame("frame is not valid JSON") from None


async def _send(ws: WebSocket, message: protocol.ServerMessage) -> bool:
    """Send to this socket; ``False`` if it is gone (the loop then ends).

    Every failure is the same failure: the socket state machine refusing us
    (``RuntimeError``), the server reporting the client gone (uvicorn raises
    ``ClientDisconnected``, an ``OSError``), a transport error, or a client that has
    stopped reading and blows ``SEND_TIMEOUT``. The manager treats sends the same way.
    """
    try:
        async with asyncio.timeout(SEND_TIMEOUT):
            await ws.send_json(message.model_dump(mode="json"))
    except Exception as exc:
        log.info("dropping socket after failed send: %r", exc)
        return False
    return True


async def _close(ws: WebSocket, code: int, reason: str) -> None:
    """Close from our side; a client that is already gone is not an error."""
    try:
        async with asyncio.timeout(SEND_TIMEOUT):
            await ws.close(code=code, reason=reason[:120])
    except Exception as exc:
        log.debug("closing socket with %d failed: %r", code, exc)


async def _reject(ws: WebSocket, code: ErrorCode, message: str, close_code: int) -> None:
    await _send(ws, protocol.Error(code=code, message=message))
    await _close(ws, close_code, message)


def _describe(exc: ValidationError) -> str:
    first = exc.errors()[0]
    where = ".".join(str(p) for p in first["loc"])
    return f"{where}: {first['msg']}" if where else first["msg"]


@router.websocket("/ws/{code}")
async def room_socket(ws: WebSocket, code: str) -> None:
    manager: RoomManager = ws.app.state.rooms
    await ws.accept()
    player: Player | None = None
    try:
        hello = await _handshake(ws)
        if hello is None:
            return
        try:
            player = await manager.connect(code, hello.session, ws)
        except BadSession as exc:
            await _reject(ws, "bad_hello", exc.message, CLOSE_BAD_HELLO)
            return
        except (RoomNotFound, RoomExpired) as exc:
            await _close(ws, CLOSE_UNKNOWN_ROOM, exc.message)
            return
        except ApiError as exc:  # the database is unavailable, or similar
            log.warning("connect to room %s failed: %s", code, exc.message)
            await _close(ws, CLOSE_INTERNAL, exc.code)
            return
        await _serve(ws, manager, code, player)
    except WebSocketDisconnect:
        pass
    finally:
        if player is not None:
            await manager.disconnect(code, player.id, ws)


async def _handshake(ws: WebSocket) -> protocol.Hello | None:
    """The first frame as ``Hello``, or ``None`` after rejecting or closing the socket."""
    try:
        async with asyncio.timeout(HELLO_TIMEOUT):
            frame = await _next_frame(ws)
        message = protocol.parse_client_message(frame)
    except TimeoutError:
        await _close(ws, CLOSE_POLICY, "no hello")
        return None
    except FrameTooBig:
        await _close(ws, CLOSE_TOO_BIG, "frame too big")
        return None
    except BadFrame as exc:
        await _reject(ws, "bad_hello", str(exc), CLOSE_BAD_HELLO)
        return None
    except ValidationError as exc:
        await _reject(ws, "bad_hello", _describe(exc), CLOSE_BAD_HELLO)
        return None
    if not isinstance(message, protocol.Hello):
        await _reject(ws, "bad_hello", "the first message must be hello", CLOSE_BAD_HELLO)
        return None
    return message


async def _serve(ws: WebSocket, manager: RoomManager, code: str, player: Player) -> None:
    """Every frame after a successful ``hello`` until the client leaves."""
    bucket = TokenBucket(RATE_PER_SECOND, RATE_BURST)
    while True:
        try:
            frame = await _next_frame(ws)
            message = protocol.parse_client_message(frame)
        except FrameTooBig:
            await _close(ws, CLOSE_TOO_BIG, "frame too big")
            return
        except BadFrame as exc:
            await _reject(ws, "bad_message", str(exc), CLOSE_PROTOCOL_ERROR)
            return
        except ValidationError as exc:
            await _reject(ws, "bad_message", _describe(exc), CLOSE_PROTOCOL_ERROR)
            return
        if isinstance(message, protocol.Hello):
            reason = "hello is only valid as the first message"
            await _reject(ws, "bad_hello", reason, CLOSE_PROTOCOL_ERROR)
            return
        if not bucket.take():
            await _close(ws, CLOSE_POLICY, "too many messages")
            return
        try:
            reply = await _dispatch(manager, code, player, message)
        except ApiError as exc:
            reply = protocol.Error(code=_error_code(exc), message=exc.message)
        if reply is not None and not await _send(ws, reply):
            return


async def _dispatch(
    manager: RoomManager, code: str, player: Player, message: protocol.ClientMessage
) -> protocol.ServerMessage | None:
    """Run one client message. ``None`` when the broadcasts say everything there is."""
    match message:
        case protocol.Ping():
            return protocol.Pong(server_time=datetime.now(UTC))
        case protocol.Answer():
            how, band, (answered, of) = await manager.submit_answer(
                code, player, message.question_id, message.value
            )
            return protocol.AnswerAck(
                question_id=message.question_id, scoring=how, band=band, answered=answered, of=of
            )
        case protocol.StartGame():
            await manager.start_game(code, player)
        case protocol.Skip():
            await manager.skip(code, player)
        case protocol.Promote():
            await manager.promote(code, player, message.player_id)
        case protocol.Kick():
            await manager.kick(code, player, message.player_id)
        case protocol.EndGame():
            await manager.end_game(code, player)
        case protocol.SetProfile():
            await manager.set_profile(code, player, message.display_name, message.avatar)
        case protocol.Ready():
            await manager.set_ready(code, player, message.ready)
    return None


def _error_code(exc: ApiError) -> ErrorCode:
    return exc.code if exc.code in _ERROR_CODES else "bad_state"  # type: ignore[return-value]
