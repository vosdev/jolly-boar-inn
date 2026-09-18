"""``GET /ws/{code}``: parse frames, authenticate the first one, dispatch to ``RoomManager``.

Close codes (section 3): ``4001`` bad ``hello``, ``4004`` unknown or expired room, ``4008``
any protocol error after the handshake, each after a single ``error`` message where the
protocol has a code for it. ``4000`` (replaced by a newer socket) and ``1012`` (room left
memory) come from the manager.

T8 handles ``hello``, ``ping`` and the closes. The other client messages parse but are
answered with ``error bad_state`` until T9 wires them to the manager.
"""

import asyncio
import json
import logging
from datetime import UTC, datetime
from typing import Any

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
CLOSE_INTERNAL = 1011


class BadFrame(Exception):
    """Not a JSON text frame."""


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
        await _serve(ws, player)
    except WebSocketDisconnect:
        pass
    finally:
        if player is not None:
            await manager.disconnect(code, player.id, ws)


async def _handshake(ws: WebSocket) -> protocol.Hello | None:
    """The first frame as ``Hello``, or ``None`` after rejecting the socket with 4001."""
    try:
        frame = await _next_frame(ws)
        message = protocol.parse_client_message(frame)
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


async def _serve(ws: WebSocket, player: Player) -> None:
    """Every frame after a successful ``hello`` until the client leaves."""
    while True:
        try:
            frame = await _next_frame(ws)
            message = protocol.parse_client_message(frame)
        except BadFrame as exc:
            await _reject(ws, "bad_message", str(exc), CLOSE_PROTOCOL_ERROR)
            return
        except ValidationError as exc:
            await _reject(ws, "bad_message", _describe(exc), CLOSE_PROTOCOL_ERROR)
            return
        match message:
            case protocol.Hello():
                reason = "hello is only valid as the first message"
                await _reject(ws, "bad_hello", reason, CLOSE_PROTOCOL_ERROR)
                return
            case protocol.Ping():
                reply: protocol.ServerMessage = protocol.Pong(server_time=datetime.now(UTC))
            case _:
                # T9 dispatches answer / start_game / skip / promote / kick / end_game.
                reply = protocol.Error(
                    code="bad_state", message=f"{message.t} is not available in this room yet"
                )
        if not await _send(ws, reply):
            return
