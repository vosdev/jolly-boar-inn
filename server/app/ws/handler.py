"""``GET /ws/{code}``: parse frames, authenticate the first one, dispatch to ``RoomManager``.

Close codes ("Websocket protocol"): ``4001`` bad ``hello``, ``4004`` unknown or expired room,
``4008`` any protocol error after the handshake, each after a single ``error`` message where
the protocol has a code for it. ``1008`` for no ``hello`` within ``HELLO_TIMEOUT``, a socket
over its message rate, a session or address connecting too often, the oldest of too many
sockets an address holds that have not said ``hello``, an address over its budget of rooms
not found, or a page on another site opening the socket, before any budget is charged,
``1009`` for a frame over ``MAX_FRAME``, ``1011`` for a call that failed on our side, and
``1013`` for a socket past ``MAX_SOCKETS``, before its ``hello``: the client reconnects after
these. ``4000`` (replaced by a newer socket) and ``1012`` (room left memory) come from the
manager.

Every message after the handshake is one ``RoomManager`` call. A call that raises
``ApiError`` becomes a single ``error`` frame and the socket stays open: a rejected
message (``not_admin``, ``not_open``, ``already_answered``) is not a protocol error.
Only a frame we cannot parse closes the socket, or a call that fails some other way (a
database blip), which closes it with ``1011`` for the client to reconnect. A socket whose
outbox is already closing (replaced, kicked, restarted) has its frames dropped.

Commands other than ``answer``, ``use_item`` and ``ping`` have no direct reply. What they
did reaches every client, the sender included, through the broadcasts the manager sends.

After the handshake nothing here writes to the socket directly: replies and closes go
through the socket's ``Outbox``, behind the broadcasts already queued on it.
"""

import asyncio
import json
import logging
import time
from collections.abc import Callable
from contextlib import nullcontext
from datetime import UTC, datetime
from typing import Any, get_args
from urllib.parse import urlsplit

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import ValidationError

from app import metrics
from app.errors import ApiError
from app.http.ratelimit import OldestOut, OpenCount, RateLimited, client_key, room_lookup
from app.rooms.errors import BadSession, RoomExpired, RoomNotFound
from app.rooms.models import Player, hash_token
from app.rooms.state import RoomManager
from app.ws import protocol
from app.ws.outbox import Outbox
from app.ws.outbox import close as outbox_close
from app.ws.outbox import send as outbox_send
from app.ws.protocol import ErrorCode

log = logging.getLogger("app.ws")
router = APIRouter()

CLOSE_BAD_HELLO = 4001
CLOSE_UNKNOWN_ROOM = 4004
CLOSE_PROTOCOL_ERROR = 4008
CLOSE_POLICY = 1008
CLOSE_TOO_BIG = 1009
CLOSE_INTERNAL = 1011
CLOSE_TRY_AGAIN_LATER = 1013
# ``app.state.sockets`` counts one total, not one per address.
_EVERY_SOCKET = ""
# uvicorn's ``--ws-max-size`` refuses bigger frames before they reach us. This repeats it
# for any other launcher, and so that ``json.loads`` never sees one: a 16 MiB array of
# empty objects costs hundreds of MB to parse. The largest real frame is well under 1 KB.
MAX_FRAME = 65536
# Until ``hello`` the socket belongs to nobody, so nothing else would ever close it.
HELLO_TIMEOUT = 10.0
# Per socket, after the handshake. A player tapping as fast as they can stays far below.
RATE_PER_SECOND = 10.0
RATE_BURST = 20
# The ``ApiError.code`` values that are also websocket error codes ("Websocket protocol"). Anything
# else a manager call raises is a room that cannot take the message: ``bad_state``.
_ERROR_CODES: frozenset[str] = frozenset(get_args(ErrorCode))


class BadFrame(Exception):
    """Not a JSON text frame."""


class FrameTooBig(Exception):
    """A text frame over ``MAX_FRAME``."""


class Displaced(Exception):
    """A newer socket from the same address took this one's place before its ``hello``."""


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
    """Send to this socket before it has an outbox; ``False`` if it is gone.

    Every failure is the same failure: the socket state machine refusing us
    (``RuntimeError``), the server reporting the client gone (uvicorn raises
    ``ClientDisconnected``, an ``OSError``), a transport error, or a client that has
    stopped reading and blows ``SEND_TIMEOUT``. The outbox treats sends the same way.
    """
    return await outbox_send(ws, message.model_dump(mode="json"))


async def _close(ws: WebSocket, code: int, reason: str) -> None:
    """Close from our side; a client that is already gone is not an error."""
    await outbox_close(ws, code, reason)


async def _reject(ws: WebSocket, code: ErrorCode, message: str, close_code: int) -> None:
    await _send(ws, protocol.Error(code=code, message=message))
    await _close(ws, close_code, message)


def _describe(exc: ValidationError) -> str:
    first = exc.errors()[0]
    where = ".".join(str(p) for p in first["loc"])
    return f"{where}: {first['msg']}" if where else first["msg"]


def _foreign_origin(ws: WebSocket) -> bool:
    """Whether a browser opened this socket from a page that is not the app's.

    Browsers let any page open a websocket anywhere, so without this a page a player visits
    could spend their address's connect and miss budgets. A client that is not a browser
    sends no ``Origin``. Behind a proxy that rewrites ``Host``, ``PUBLIC_BASE_URL`` matches.
    """
    origin = ws.headers.get("origin")
    if origin is None:
        return False
    theirs = urlsplit(origin).netloc.lower()
    ours = {
        ws.headers.get("host", "").lower(),
        urlsplit(ws.app.state.settings.public_base_url).netloc.lower(),
    }
    return not theirs or theirs not in ours


@router.websocket("/ws/{code}")
async def room_socket(ws: WebSocket, code: str) -> None:
    sockets: OpenCount = ws.app.state.sockets
    await ws.accept()
    if _foreign_origin(ws):
        metrics.WS_DISCONNECTS.labels(reason="cross_site").inc()
        await _close(ws, CLOSE_POLICY, "cross-site socket")
        return
    if not sockets.enter(_EVERY_SOCKET):
        metrics.WS_DISCONNECTS.labels(reason="server_full").inc()
        await _close(ws, CLOSE_TRY_AGAIN_LATER, "server is full, try again later")
        return
    try:
        await _room_socket(ws, code)
    finally:
        sockets.leave(_EVERY_SOCKET)


async def _room_socket(ws: WebSocket, code: str) -> None:
    """One accepted socket, from its ``hello`` until it is finished with."""
    manager: RoomManager = ws.app.state.rooms
    host = ws.client.host if ws.client else ""
    key = client_key(host)
    pending: OldestOut = ws.app.state.pending_hellos
    player: Player | None = None
    outbox: Outbox | None = None
    try:
        displaced = pending.enter(key)
        try:
            hello = await _handshake(ws, displaced)
        finally:
            pending.leave(key, displaced)
        if hello is None:
            return
        try:
            # A session already in the room proves it knows the room exists, so letting it
            # past the address's budgets reveals nothing, and a shared address one device
            # spent cannot keep its players from reconnecting.
            trusted = manager.holds_session(code, hello.session)
            _check_connects(ws, key, hello.session, trusted)
            lookup = nullcontext() if trusted else room_lookup(ws.app.state.lookup_misses, host)
            with lookup:
                player, outbox = await manager.connect(code, hello.session, ws, key)
        except RateLimited as exc:
            metrics.WS_DISCONNECTS.labels(reason="rate_limited").inc()
            await _close(ws, CLOSE_POLICY, exc.message)
            return
        except BadSession as exc:
            metrics.WS_DISCONNECTS.labels(reason="bad_hello").inc()
            await _reject(ws, "bad_hello", exc.message, CLOSE_BAD_HELLO)
            return
        except (RoomNotFound, RoomExpired) as exc:
            metrics.WS_DISCONNECTS.labels(reason="unknown_room").inc()
            await _close(ws, CLOSE_UNKNOWN_ROOM, exc.message)
            return
        except ApiError as exc:  # the database is unavailable, or similar
            metrics.WS_DISCONNECTS.labels(reason="internal_error").inc()
            log.warning("connect to room %s failed: %s", code, exc.message)
            await _close(ws, CLOSE_INTERNAL, exc.code)
            return
        await _serve(ws, outbox, manager, code, player)
    except WebSocketDisconnect:
        if outbox is None or not outbox.closing:
            metrics.WS_DISCONNECTS.labels(reason="client").inc()
    finally:
        if player is not None:
            await manager.disconnect(code, player.id, ws)
        if outbox is not None:
            # Returning ends the socket, so whatever this handler queued last (an error
            # and its close) has to be written first.
            await outbox.finished()


def _check_connects(ws: WebSocket, key: str, session: str, trusted: bool) -> None:
    """Refuse a session or an address that connects too often, before the room is touched.

    The address first, so one address can leave at most its own budget of session keys a
    window however many sessions it makes up. A trusted session answers to its own budget.
    """
    state = ws.app.state
    if not trusted:
        state.connects.check(key, "too many connects from this address")
    state.session_connects.check(hash_token(session), "this session connects too often")


async def _first_frame(ws: WebSocket, displaced: asyncio.Event) -> Any:
    """The first decoded frame; ``Displaced`` if ``displaced`` is set before it comes."""
    frame = asyncio.ensure_future(_next_frame(ws))
    newer = asyncio.ensure_future(displaced.wait())
    try:
        done, _ = await asyncio.wait({frame, newer}, return_when=asyncio.FIRST_COMPLETED)
    finally:
        frame.cancel()
        newer.cancel()
    if frame in done:
        return frame.result()
    raise Displaced


async def _handshake(ws: WebSocket, displaced: asyncio.Event) -> protocol.Hello | None:
    """The first frame as ``Hello``, or ``None`` after rejecting or closing the socket."""
    try:
        async with asyncio.timeout(HELLO_TIMEOUT):
            frame = await _first_frame(ws, displaced)
        message = protocol.parse_client_message(frame)
    except Displaced:
        metrics.RATE_LIMITED.labels(limiter="connects").inc()
        metrics.WS_DISCONNECTS.labels(reason="rate_limited").inc()
        await _close(ws, CLOSE_POLICY, "too many connects from this address")
        return None
    except TimeoutError:
        metrics.WS_DISCONNECTS.labels(reason="no_hello").inc()
        await _close(ws, CLOSE_POLICY, "no hello")
        return None
    except FrameTooBig:
        metrics.WS_DISCONNECTS.labels(reason="frame_too_big").inc()
        await _close(ws, CLOSE_TOO_BIG, "frame too big")
        return None
    except BadFrame as exc:
        metrics.WS_DISCONNECTS.labels(reason="bad_hello").inc()
        await _reject(ws, "bad_hello", str(exc), CLOSE_BAD_HELLO)
        return None
    except ValidationError as exc:
        metrics.WS_DISCONNECTS.labels(reason="bad_hello").inc()
        await _reject(ws, "bad_hello", _describe(exc), CLOSE_BAD_HELLO)
        return None
    if not isinstance(message, protocol.Hello):
        metrics.WS_DISCONNECTS.labels(reason="bad_hello").inc()
        await _reject(ws, "bad_hello", "the first message must be hello", CLOSE_BAD_HELLO)
        return None
    metrics.WS_MESSAGES.labels(type="hello").inc()
    return message


def _refuse(outbox: Outbox, code: ErrorCode, message: str, close_code: int) -> None:
    outbox.put(protocol.Error(code=code, message=message).model_dump(mode="json"))
    if outbox.close(close_code, message):
        metrics.WS_DISCONNECTS.labels(reason="bad_message").inc()


async def _serve(
    ws: WebSocket, outbox: Outbox, manager: RoomManager, code: str, player: Player
) -> None:
    """Every frame after a successful ``hello`` until the client leaves."""
    bucket = TokenBucket(RATE_PER_SECOND, RATE_BURST)
    while True:
        try:
            frame = await _next_frame(ws)
            message = protocol.parse_client_message(frame)
        except FrameTooBig:
            if outbox.close(CLOSE_TOO_BIG, "frame too big"):
                metrics.WS_DISCONNECTS.labels(reason="frame_too_big").inc()
            return
        except BadFrame as exc:
            _refuse(outbox, "bad_message", str(exc), CLOSE_PROTOCOL_ERROR)
            return
        except ValidationError as exc:
            _refuse(outbox, "bad_message", _describe(exc), CLOSE_PROTOCOL_ERROR)
            return
        # Replaced, kicked or restarted: whatever it sends now is no longer the player's.
        if outbox.closing:
            return
        if isinstance(message, protocol.Hello):
            reason = "hello is only valid as the first message"
            _refuse(outbox, "bad_hello", reason, CLOSE_PROTOCOL_ERROR)
            return
        if not bucket.take():
            metrics.RATE_LIMITED.labels(limiter="ws_messages").inc()
            if outbox.close(CLOSE_POLICY, "too many messages"):
                metrics.WS_DISCONNECTS.labels(reason="rate_limited").inc()
            return
        metrics.WS_MESSAGES.labels(type=message.t).inc()
        try:
            reply = await _dispatch(manager, code, player, message)
        except ApiError as exc:
            reply = protocol.Error(code=_error_code(exc), message=exc.message)
        except Exception:
            # The room's memory is as it was, since every write comes first; a fresh welcome
            # is what the client needs, so it is closed to reconnect for one.
            log.exception("room %s: %s from %s failed", code, message.t, player.id)
            if outbox.close(CLOSE_INTERNAL, "server error, reconnect"):
                metrics.WS_DISCONNECTS.labels(reason="internal_error").inc()
            return
        replies = reply if isinstance(reply, tuple) else () if reply is None else (reply,)
        if not all(outbox.put(each.model_dump(mode="json")) for each in replies):
            return


async def _dispatch(
    manager: RoomManager, code: str, player: Player, message: protocol.ClientMessage
) -> protocol.ServerMessage | tuple[protocol.ServerMessage, ...] | None:
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
        case protocol.UseItem():
            item, ack = await manager.use_item(code, player, message.question_id)
            used = protocol.ItemUsed(question_id=message.question_id, item=item)
            if ack is None:
                return used
            how, band, (answered, of) = ack
            return used, protocol.AnswerAck(
                question_id=message.question_id, scoring=how, band=band, answered=answered, of=of
            )
        case protocol.StartGame():
            await manager.start_game(code, player)
        case protocol.Skip():
            await manager.skip(code, player, message.phase, message.index)
        case protocol.Promote():
            await manager.promote(code, player, message.player_id)
        case protocol.SetTv():
            await manager.set_tv(code, player, message.player_id, message.on)
        case protocol.Kick():
            await manager.kick(code, player, message.player_id)
        case protocol.EndGame():
            await manager.end_game(code, player)
        case protocol.Rematch():
            await manager.rematch(code, player)
        case protocol.EndRound():
            await manager.end_round(code, player, message.index)
        case protocol.RotateKey():
            await manager.rotate_key(code, player)
        case protocol.DecideRequest():
            await manager.decide_request(code, player, message.request_id, message.accept)
        case protocol.SetProfile():
            await manager.set_profile(code, player, message.display_name, message.avatar)
        case protocol.Ready():
            await manager.set_ready(code, player, message.ready)
        case protocol.SetTeam():
            await manager.set_team(code, player, message.team)
        case protocol.MoveTeam():
            await manager.move_team(code, player, message.player_id, message.team)
        case protocol.SetTeams():
            await manager.set_teams(code, player, message.teams)
        case protocol.SetSettings():
            await manager.set_settings(code, player, message.settings)
        case protocol.Editing():
            await manager.set_editing(code, player, message.on)
    return None


def _error_code(exc: ApiError) -> ErrorCode:
    return exc.code if exc.code in _ERROR_CODES else "bad_state"  # type: ignore[return-value]
