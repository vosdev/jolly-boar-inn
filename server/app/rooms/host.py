"""``RoomHost``: what ``RoomManager``'s mixins may use of ``self``.

``Joins``, ``Lobby``, ``Loop`` and ``DailyRooms`` call one another and ``state.py`` through
``self``, and only the assembled ``RoomManager`` has all of it. Declaring that surface once
lets the type checker hold each mixin to it, so a renamed helper or a changed signature
fails ``make lint`` rather than whichever test happens to reach the call.
"""

import asyncio
import random
from abc import ABC, abstractmethod
from collections.abc import Awaitable, Callable, Iterable, Mapping, Sequence
from contextlib import AbstractAsyncContextManager
from uuid import UUID

import asyncpg

from app.config import Settings
from app.questions.packs import Pack
from app.rooms.items import Item
from app.rooms.models import Broadcast, Room, RoomQuestion
from app.ws.protocol import RoomView


class RoomHost(ABC):
    """The attributes ``RoomManager.__init__`` sets and the helpers the mixins share.

    ``state.py`` implements the helpers, but for the last four, which are ``Lobby``'s.
    """

    _pool: Callable[[], Awaitable[asyncpg.Pool]]
    packs: Sequence[Pack]
    settings: Settings
    words: Sequence[str]
    pets: frozenset[str]
    pictures: Mapping[str, str]
    rng: random.Random
    code_rng: random.Random
    clock: Callable[[], float]
    splashes: bool
    editing_seconds: float
    all_answered_pause: float
    request_stale_seconds: float
    items: Sequence[Item]
    rooms: dict[str, Room]

    @abstractmethod
    def _locked(self, code: str, touch: bool = True) -> AbstractAsyncContextManager[asyncio.Lock]:
        """Hold ``code``'s room lock."""

    @abstractmethod
    async def _room(self, code: str) -> Room:
        """The room, loaded if need be, for a caller holding its lock."""

    @abstractmethod
    def _broadcast(self, broadcast: Broadcast) -> None:
        """Queue every snapshotted frame on its socket."""

    @abstractmethod
    def _room_updated(
        self, room: Room, exclude: UUID | None = None, standings: bool = False
    ) -> Broadcast:
        """Snapshot ``room_updated`` and its recipients."""

    @abstractmethod
    def _players_updated(
        self,
        room: Room,
        before: RoomView,
        exclude: UUID | None = None,
        after: RoomView | None = None,
    ) -> Broadcast:
        """``players_updated``, or ``room_updated`` if the room itself moved since ``before``."""

    @abstractmethod
    async def _restart(self, room: Room) -> None:
        """Drop a room whose timer step failed, unless it has already left memory."""

    @abstractmethod
    def _answer_seconds(self, room: Room, question: RoomQuestion) -> int:
        """How long ``question`` stays open."""

    @abstractmethod
    def _reveal_hold(self, room: Room, question: RoomQuestion | None) -> tuple[float, int | None]:
        """How long a reveal waits, and the length its countdown shows."""

    @abstractmethod
    def _picture(self, question: RoomQuestion) -> str | None:
        """The name ``question``'s picture has in the client."""

    @abstractmethod
    def _open_picture(self, question: RoomQuestion) -> str | None:
        """``_picture`` for an open question."""

    @abstractmethod
    def _pictures(self, question: RoomQuestion) -> Mapping[str, str]:
        """The pictures ``question`` may show, by asset id."""

    @abstractmethod
    def _pet_for(self, avatar: str | None, worn: Iterable[str | None]) -> str:
        """The pet to store for a player who chose ``avatar``."""

    @abstractmethod
    def check_avatar(self, avatar: str | None) -> None:
        """Refuse a pet nobody can pick."""

    @abstractmethod
    def _rounds_offered(self) -> list[str]:
        """The modes this server plays as rounds."""

    @abstractmethod
    def _plan_lobby(self, room: Room) -> None:
        """Work out the numbers a lobby shows from its settings."""
