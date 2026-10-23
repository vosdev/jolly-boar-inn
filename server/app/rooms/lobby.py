"""A player's own lobby state: profile, team, ready check and the ``editing`` flag."""

import asyncio
from collections.abc import Iterable
from uuid import UUID

import asyncpg

from app.rooms.errors import BadAvatar, BadState, BadValue, NameTaken
from app.rooms.loop import _recount_splash
from app.rooms.models import Player, Room, _require_admin, normalize_name
from app.rooms.teams import God, check_teams

# Seconds between one player's lobby ready changes, and between their profile changes.
CHANGE_COOLDOWN = 1.0
# Seconds an ``editing`` flag lasts without being sent again. A tab that froze or lost its
# socket half-way would otherwise leave "picking a name…" up for the rest of the lobby.
EDITING_SECONDS = 60.0


def _cool_down(last: float, now: float) -> None:
    if now - last < CHANGE_COOLDOWN:
        raise BadState("wait a moment before changing that again")


def _check_team(room: Room, team: God) -> None:
    """Refuse a team change outside the lobby of a team game, or to a god not playing."""
    if not room.settings.teams:
        raise BadState("this room is not a team game")
    if room.status != "lobby":
        raise BadState("teams are fixed once the game has started")
    if team not in room.settings.teams:
        raise BadValue(f"{team} is not a team in this room")


def _check_teams_ready(room: Room) -> None:
    """Refuse to start a team game with anyone but the TV teamless, disconnected or not, or
    one team."""
    players = [player for player in room.players.values() if player.role != "tv"]
    if any(player.team is None for player in players):
        raise BadState("everyone needs a team before the game starts")
    if len({player.team for player in players}) < 2:
        raise BadState("a team game needs players on at least two teams")


class Lobby:
    """The ``RoomManager`` methods a player calls on their own profile and ready state."""

    async def set_profile(
        self, code: str, player: Player, display_name: str | None, avatar: str | None
    ) -> None:
        """Rename, re-roll the head, or both (section 5.1.1 of ideas/design.md).

        Held to exactly what a join is: the same name rules, the same case-insensitive
        uniqueness in the room -- the unique index is what decides, so a rename racing a
        join cannot both win -- and a head from the manifest. A rejected change leaves
        the row and the room exactly as they were. Only in the lobby: a name that changes
        mid-game leaves the others unsure who is ahead of them. A change within
        ``CHANGE_COOLDOWN`` of the last one is ``bad_state``. A rename lands with the
        player's ``editing`` already off.

        Nothing changed is nothing broadcast. Everybody else hears about a real change
        through ``room_updated``, the sender included, like every other command.
        """
        code = code.upper()
        name = normalize_name(display_name) if display_name is not None else None
        self.check_avatar(avatar)
        pool = await self._pool()
        async with self._locked(code):
            room = await self._room(code)
            # The ``Player`` the handler holds is the one in the room, unless the room
            # left memory and came back since; the room's copy is the live one.
            target = room.players.get(player.id)
            if target is None:
                raise BadState("you are no longer in this room")
            if room.status != "lobby":
                raise BadState("names are fixed once the game has started")
            new_name = target.display_name if name is None else name
            new_avatar = target.avatar if avatar is None else avatar
            if (new_name, new_avatar) == (target.display_name, target.avatar):
                return
            now = self.clock()
            _cool_down(target.profile_changed_at, now)
            async with pool.acquire() as conn:
                try:
                    await conn.execute(
                        "update players set display_name = $2, avatar = $3 where id = $1",
                        target.id,
                        new_name,
                        new_avatar,
                    )
                except asyncpg.UniqueViolationError:
                    raise NameTaken(f"the name {new_name!r} is taken in room {code}") from None
            target.display_name = new_name
            target.avatar = new_avatar
            target.profile_changed_at = now
            target.stop_editing()
            update = self._room_updated(room)
        self._broadcast(update)

    def _pet_for(self, avatar: str | None, worn: Iterable[str | None]) -> str:
        """The pet to store: the one chosen, else a random one nobody in ``worn`` has."""
        if avatar is not None:
            return avatar
        pool = sorted(self.pets.difference(worn)) or sorted(self.pets)
        return self.rng.choice(pool)

    def check_avatar(self, avatar: str | None) -> None:
        """Refuse a pet nobody can pick, before anything is written."""
        if avatar is not None and avatar not in self.pets:
            raise BadAvatar("avatar must be the id of a pet in the picker")

    async def set_team(self, code: str, player: Player, team: God) -> None:
        """Join one of the room's teams, in the lobby of a team game, while not ready.

        Ready is a promise to the others about the team you are on, so it has to be taken
        back first. A change within ``CHANGE_COOLDOWN`` of the last one is ``bad_state``.
        """
        code = code.upper()
        async with self._locked(code):
            room = await self._room(code)
            target = room.players.get(player.id)
            if target is None:
                raise BadState("you are no longer in this room")
            _check_team(room, team)
            if target.role == "tv":
                raise BadState("the TV plays for no team")
            if target.ready:
                raise BadState("take your ready back before changing team")
            if target.team == team:
                return
            now = self.clock()
            _cool_down(target.team_changed_at, now)
            await self._store_team(target, team)
            target.team_changed_at = now
            update = self._players_updated(room, room.view())
        self._broadcast(update)

    async def move_team(self, code: str, by: Player, player_id: UUID, team: God) -> None:
        """Admin: put anyone on one of the room's teams, in the lobby, ready or not.

        A disconnected player can be moved too, so the host can settle every team before
        the start. Their ready stays: the host's move is not theirs to take back.
        """
        code = code.upper()
        async with self._locked(code):
            room = await self._room(code)
            _require_admin(by)
            target = room.players.get(player_id)
            if target is None:
                raise BadState("there is no such player in this room")
            _check_team(room, team)
            if target.role == "tv":
                raise BadState("the TV plays for no team")
            if target.team == team:
                return
            await self._store_team(target, team)
            update = self._players_updated(room, room.view())
        self._broadcast(update)

    async def set_teams(self, code: str, by: Player, teams: list[str]) -> None:
        """Admin: change which gods a team game has, in the lobby, keeping 2 to 6 of them.

        A room without teams stays one, and a team room stays one. Players on a dropped
        team go back to no team and lose their ready: they promised it to a team that is
        gone. The rows are written before memory, in one transaction.
        """
        code = code.upper()
        pool = await self._pool()
        async with self._locked(code):
            room = await self._room(code)
            _require_admin(by)
            if not room.settings.teams:
                raise BadState("this room is not a team game")
            if room.status != "lobby":
                raise BadState("teams are fixed once the game has started")
            try:
                gods = check_teams(teams)
            except ValueError as exc:
                raise BadValue(str(exc)) from None
            if gods == room.settings.teams:
                return
            settings = room.settings.model_copy(update={"teams": gods})
            dropped = [p for p in room.players.values() if p.team and p.team not in gods]
            async with pool.acquire() as conn, conn.transaction():
                await conn.execute(
                    "update rooms set settings = $2 where id = $1", room.id, settings.model_dump()
                )
                await conn.execute(
                    "update players set team = null where id = any($1::uuid[])",
                    [p.id for p in dropped],
                )
            room.settings = settings
            for target in dropped:
                target.team = None
                target.ready = False
            update = self._room_updated(room)
        self._broadcast(update)

    async def _store_team(self, target: Player, team: God) -> None:
        """Write the row, then the player: a failed write leaves memory as it was. Lock held."""
        pool = await self._pool()
        async with pool.acquire() as conn:
            await conn.execute("update players set team = $2 where id = $1", target.id, team)
        target.team = team

    async def set_ready(self, code: str, player: Player, is_ready: bool) -> None:
        """Tap ready, or take it back (section 7.1 of ideas/design.md).

        In the lobby it is what the host's Start waits on. On a splash it is what ends the
        splash (``rooms/ready.py``): the threshold starts a countdown, everyone ready
        shortens it, and taking a tap back below the threshold stops it again. The
        countdown rides as ``next_at`` on the same frame that says who is ready.
        A splash allows each player one un-ready; a second is ``bad_state``, so nobody can
        spam the countdown on and off. In the lobby, a change within ``CHANGE_COOLDOWN``
        of the last one is ``bad_state``.

        Anywhere else there is nothing to be ready for. Nothing changed is nothing
        broadcast.
        """
        code = code.upper()
        async with self._locked(code):
            room = await self._room(code)
            target = room.players.get(player.id)
            if target is None:
                raise BadState("you are no longer in this room")
            in_splash = room.status == "playing" and room.phase == "splash"
            if room.status != "lobby" and not in_splash:
                raise BadState("there is nothing to be ready for")
            if target.role == "tv":
                raise BadState("the TV plays no part")
            if target.ready == is_ready:
                return
            if is_ready and room.settings.teams and target.team is None:
                raise BadState("pick a team before you ready up")
            before = room.view()
            if in_splash and not is_ready:
                if target.unreadied:
                    raise BadState("you can only take your ready back once a round")
                target.unreadied = True
            if not in_splash:
                now = self.clock()
                _cool_down(target.ready_changed_at, now)
                target.ready_changed_at = now
            target.ready = is_ready
            _recount_splash(room, self.clock(), unready=not is_ready)
            update = self._players_updated(room, before)
        self._broadcast(update)

    async def set_editing(self, code: str, player: Player, on: bool) -> None:
        """Say the player is in the name field in the lobby, or has left it.

        Advice for the others, never a gate. An ``on`` for a flag that is already on only
        restarts its ``EDITING_SECONDS``. A change is broadcast; spam is held to two a
        second by ignoring an ``on`` within ``CHANGE_COOLDOWN`` of the last change, while
        an ``off`` always lands so a flag never outlives the focus. Outside the lobby it is
        ignored rather than refused: the client sends it on its own, not on a tap.
        """
        code = code.upper()
        async with self._locked(code):
            room = await self._room(code)
            target = room.players.get(player.id)
            if target is None:
                raise BadState("you are no longer in this room")
            now = self.clock()
            if not on:
                if not target.stop_editing():
                    return
            elif room.status != "lobby":
                return
            elif target.editing:
                self._expire_editing_later(room, target)
                return
            elif now - target.editing_changed_at < CHANGE_COOLDOWN:
                return
            else:
                target.editing = True
                self._expire_editing_later(room, target)
            target.editing_changed_at = now
            update = self._players_updated(room, room.view())
        self._broadcast(update)

    def _expire_editing_later(self, room: Room, player: Player) -> None:
        """(Re)start the countdown that clears ``player.editing``. Lock held."""
        if player.editing_expiry is not None:
            player.editing_expiry.cancel()
        player.editing_expiry = asyncio.create_task(self._expire_editing(room, player))

    async def _expire_editing(self, room: Room, player: Player) -> None:
        await asyncio.sleep(self.editing_seconds)
        async with room.lock:
            # A kick or the room leaving memory keeps the task going but drops the player.
            if self.rooms.get(room.code) is not room or room.players.get(player.id) is not player:
                return
            player.editing_expiry = None
            player.editing = False
            update = self._players_updated(room, room.view())
        self._broadcast(update)
