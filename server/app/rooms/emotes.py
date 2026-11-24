"""Emotes at the table: a pet acts one out and says one of its two lines, for everyone in the room.

Only while the sender waits, so it never competes with a question they can still answer. Nothing
is stored, sent in ``welcome`` or replayed: an emote is gone once it has played.
"""

from typing import get_args

from app import metrics
from app.rooms.errors import BadState, BadValue
from app.rooms.host import RoomHost
from app.rooms.models import Broadcast, Player, Room
from app.ws.protocol import Emote, EmoteSent

EMOTES: frozenset[str] = frozenset(get_args(Emote))
EMOTE_COOLDOWN = 3.0


def _waiting(room: Room, player: Player) -> bool:
    """Whether ``player`` waits now: the lobby, a reveal, the standings, or an answered question."""
    if room.daily is not None or player.role == "tv":
        return False
    if room.status == "lobby":
        return True
    if room.status != "playing":
        return False
    if room.phase in ("reveal", "standings"):
        return True
    question = room.open_question()
    if question is None:
        return False
    return player.id in question.answers or not room.can_answer(question, player.id)


class Emotes(RoomHost):
    """The ``RoomManager`` method behind the emote tab."""

    async def emote(self, code: str, player: Player, emote: str) -> None:
        """Broadcast ``player``'s emote with a line picked here, so every screen says the same.

        An unknown emote is ``bad_value``; one sent while the player cannot wait for anything
        is ``bad_state``. One within ``EMOTE_COOLDOWN`` of their last is dropped silently, as a
        double tap the button's cooldown should have stopped.
        """
        if emote not in EMOTES:
            raise BadValue(f"there is no {emote!r} emote")
        code = code.upper()
        async with self._locked(code):
            room = await self._room(code)
            target = room.players.get(player.id)
            if target is None:
                raise BadState("you are no longer in this room")
            if not _waiting(room, target):
                raise BadState("emotes are only for while you wait")
            now = self.clock()
            if now - target.emoted_at < EMOTE_COOLDOWN:
                metrics.RATE_LIMITED.labels(limiter="emotes").inc()
                return
            target.emoted_at = now
            sent = EmoteSent(player_id=target.id, emote=emote, line=self.rng.randrange(2))  # type: ignore[arg-type]
            frames = Broadcast.to_all(room, sent.model_dump(mode="json"))
        self._broadcast(frames)
