"""Surprise rounds: a player is sent a round's mode only once that round has started.

The checks search the serialised frames for the mode ids rather than reading one field,
so a mode leaking through any part of any frame fails them.
"""

import json
from typing import Any
from uuid import UUID

import pytest

from app.modes import offered, questions_bounds
from app.rooms.settings import RoomSettings
from tests.game_api import Game, Seat, reseat, updated
from tests.rooms_api import begin, create, hello
from tests.test_rematch import in_lobby

# Three real modes, played in this order. Neither later id is also a question type an
# event could carry, so finding one in a frame means the round leaked.
PLAYED = ["more_less", "price_is_right", "guess_examine"]
ROOM_KEYS = {
    "code",
    "status",
    "settings",
    "current_index",
    "total",
    "events",
    "phase",
    "next_at",
    "reveal_seconds",
    "estimated_seconds",
    "segment",
    "played",
    "finished_at",
}
SETTINGS_KEYS = {
    "modes",
    "mode_order",
    "random_event_frequency",
    "pace",
    "difficulty",
    "standings_seconds",
    "close_when_all_answered",
    "name_wrong_answers",
    "items",
    "max_players",
    "teams",
}


def surprise(table: Any, hide_rounds: bool = True, mode_order: str = "listed") -> Game:
    """Three rounds of five, listed unless shuffled, with events in them and nothing moving
    unless skipped.

    Zezima's socket stays up for the whole game; Woox is the one a test reconnects.
    """
    return table(
        "Zezima",
        "Woox",
        hide_rounds=hide_rounds,
        mode_order=mode_order,
        random_event_frequency="more",
        reveal_seconds=30,
        splash=True,
        standings_seconds=30,
        seconds=30,
        modes=[{"mode": mode, "questions": 5} for mode in PLAYED],
    )


def step(game: Game) -> dict[str, Any]:
    """Skip the phase the room is in; the admin's frame announcing the next one."""
    room = game.room
    phase, index = room.phase, room.current_index
    assert index is not None
    game.admin.skip(phase, index)
    while True:
        message = game.admin.ws.receive_json()
        game.admin.seen.append(message)
        if message["t"] in {"question_open", "question_closed", "game_finished"}:
            return message
        if message["t"] == "room_updated" and message["room"]["phase"] != phase:
            return message


def play_until(game: Game, done: Any) -> None:
    """Start the game and skip through it until ``done(frame)`` holds for the admin's."""
    game.start()
    if done(game.splash()):
        return
    while not done(step(game)):
        pass


def finished(message: dict[str, Any]) -> bool:
    return message["t"] == "game_finished"


def frames_until_finished(seat: Seat) -> list[dict[str, Any]]:
    frames = []
    while not frames or frames[-1]["t"] != "game_finished":
        frames.append(seat.ws.receive_json())
    return frames


def round_named(frame: dict[str, Any], index: int) -> bool:
    """Whether ``frame`` is the first to name round ``index``: the standings before it."""
    if frame["t"] != "room_updated":
        return False
    room = frame["room"]
    return (room.get("next_segment") or room["segment"] or {}).get("index") == index


def before_round(frames: list[dict[str, Any]], index: int) -> str:
    """Every frame before round ``index`` was named, serialised."""
    start = next(at for at, frame in enumerate(frames) if round_named(frame, index))
    return json.dumps(frames[:start])


def played_modes(room: dict[str, Any]) -> list[str]:
    return [entry["mode"] for entry in room["settings"]["modes"]]


def test_a_player_hears_of_no_round_before_the_standings_name_it(table) -> None:
    game = surprise(table)
    play_until(game, finished)
    frames = frames_until_finished(game.players[0])
    first = before_round(frames, 1)
    assert "price_is_right" not in first
    assert "guess_examine" not in first
    assert "guess_examine" not in before_round(frames, 2)
    standings = [
        m["room"] for m in frames if m["t"] == "room_updated" and m["room"]["phase"] == "standings"
    ]
    assert [room["next_segment"]["mode"] for room in standings] == PLAYED[1:]
    # Then the splash reveals it, and every round has been played by the end.
    last = [m["room"] for m in frames if m["t"] == "room_updated"][-1]
    assert played_modes(last) == PLAYED


def test_a_random_event_inside_a_hidden_round_names_no_later_round(table) -> None:
    game = surprise(table)
    play_until(game, finished)
    frames = frames_until_finished(game.players[0])
    round_three = next(s.start for s in game.room.segments if s.index == 2)
    events = [
        frame
        for frame in frames
        if frame["t"] == "question_open"
        and frame["question"]["random_event"] is not None
        and frame["question"]["index"] < round_three
    ]
    assert events, "the room was meant to have an event before its last round"
    for event in events:
        question = event["question"]
        assert question["segment"]["index"] < 2
        assert question["mode"] not in PLAYED
        assert "guess_examine" not in json.dumps(event)


def test_an_admin_is_sent_every_round_all_along(table) -> None:
    game = surprise(table)
    play_until(game, finished)
    rooms = [m["room"] for m in game.admin.seen if m["t"] == "room_updated"]
    assert rooms
    for room in rooms:
        assert played_modes(room) == PLAYED
        assert room["rounds"] == 3
        assert room["settings"]["hide_rounds"] is True


def test_rounds_are_counted_for_a_player_who_sees_none_of_them(table, client) -> None:
    game = surprise(table)
    with client.websocket_connect(f"/ws/{game.code}") as ws:
        room = hello(ws, game.players[1].session)["room"]
    assert room["settings"]["modes"] == []
    assert room["rounds"] == 3
    assert room["settings"]["hide_rounds"] is True
    play_until(game, finished)
    segments = [
        m["question"]["segment"]
        for m in frames_until_finished(game.players[0])
        if m["t"] == "question_open"
    ]
    assert {segment["total"] for segment in segments} == {3}
    assert [s["index"] for s in segments] == sorted(s["index"] for s in segments)


def test_a_reconnect_reveals_the_rounds_played_and_the_current_one(table, client) -> None:
    game = surprise(table)

    def second_round_open(message: dict[str, Any]) -> bool:
        return message["t"] == "question_open" and message["question"]["segment"]["index"] == 1

    play_until(game, second_round_open)
    with client.websocket_connect(f"/ws/{game.code}") as ws:
        again = reseat(game.players[1], ws)
        welcome = again.take("welcome")
    assert played_modes(welcome["room"]) == PLAYED[:2]
    assert welcome["room"]["played"] == PLAYED[:1]
    assert "guess_examine" not in json.dumps(welcome)


def splash_of(index: int) -> Any:
    def done(message: dict[str, Any]) -> bool:
        room = message.get("room") or {}
        return room.get("phase") == "splash" and (room.get("segment") or {}).get("index") == index

    return done


@pytest.mark.parametrize("hide_rounds", [False, True])
def test_a_shuffled_splash_names_the_rounds_played_and_no_later_one(table, hide_rounds) -> None:
    game = surprise(table, hide_rounds=hide_rounds, mode_order="random")
    play_until(game, finished)
    order = [segment.mode for segment in game.room.segments]
    frames = frames_until_finished(game.players[0])
    rooms = [m["room"] for m in frames if m["t"] == "room_updated" and m["room"]["segment"]]
    splashes = [room for room in rooms if room["phase"] == "splash"]
    assert [room["played"] for room in splashes] == [[], order[:1], order[:2]]
    for room in rooms:
        assert room["played"] == order[: room["segment"]["index"]]


def test_a_reconnect_on_the_third_round_names_the_first_two_hosts(table, client) -> None:
    game = surprise(table, mode_order="random")
    play_until(game, splash_of(2))
    order = [segment.mode for segment in game.room.segments]
    with client.websocket_connect(f"/ws/{game.code}") as ws:
        welcome = reseat(game.players[1], ws).take("welcome")
    assert welcome["room"]["segment"]["index"] == 2
    assert welcome["room"]["played"] == order[:2]


def test_a_game_ended_early_keeps_its_unplayed_rounds_hidden(table, client) -> None:
    game = surprise(table)
    play_until(game, lambda message: message["t"] == "question_open")
    game.admin.send(t="end_game")
    game.admin.take("game_finished")
    with client.websocket_connect(f"/ws/{game.code}") as ws:
        welcome = hello(ws, game.players[1].session)
    assert welcome["room"]["status"] == "finished"
    assert played_modes(welcome["room"]) == PLAYED[:1]


def test_a_promoted_player_is_sent_every_round(table) -> None:
    game = surprise(table)
    zezima = game.players[0]
    game.admin.send(t="promote", player_id=zezima.id)
    assert played_modes(zezima.take("room_updated")["room"]) == PLAYED


def test_the_room_lookup_names_no_round(table, client) -> None:
    game = surprise(table)
    assert client.get(f"/api/rooms/{game.code}").json() == {"status": "lobby", "players": 3}


def test_a_room_without_surprise_rounds_sends_what_it_always_sent(table, client) -> None:
    game = surprise(table, hide_rounds=False)
    with client.websocket_connect(f"/ws/{game.code}") as ws:
        welcome = hello(ws, game.players[1].session)
    play_until(game, finished)
    frames = frames_until_finished(game.players[0])
    rooms = [welcome["room"]] + [m["room"] for m in frames if m["t"] == "room_updated"]
    for room in rooms:
        standings = room["phase"] == "standings"
        assert set(room) == ROOM_KEYS | ({"next_segment", "drops"} if standings else set())
        assert set(room["settings"]) == SETTINGS_KEYS
        assert played_modes(room) == PLAYED
    assert [m for m in frames if m["t"] == "room_updated"] == [
        m for m in game.admin.seen if m["t"] == "room_updated"
    ]
    assert game.room.view(withhold=True) == game.room.view()


def test_hide_rounds_reads_as_off_from_a_room_stored_without_it() -> None:
    stored = RoomSettings.stored({"modes": [{"mode": "more_less"}]})
    assert stored.hide_rounds is False
    assert "hide_rounds" not in stored.model_dump()
    assert stored.model_copy(update={"hide_rounds": True}).model_dump()["hide_rounds"] is True


def surprise_modes(table: Any, count: int = 3) -> Game:
    """A room whose ``count`` rounds the server drew, listed, with nothing moving unless skipped."""
    return table(
        "Zezima",
        surprise_modes=count,
        mode_order="listed",
        reveal_seconds=30,
        splash=True,
        standings_seconds=30,
        seconds=30,
    )


def test_surprise_modes_are_drawn_from_the_offered_rounds_at_their_default_length(
    client,
) -> None:
    code, admin = create(client, surprise_modes=3)
    begin(client, code, admin)
    settings = client.app.state.rooms.rooms[code].settings
    offered_rounds = {
        m.id for m in offered(client.app.state.settings, client.app.state.packs) if m.is_round
    }
    assert settings.surprise_modes == 3
    assert settings.hide_rounds is True
    assert len(set(settings.mode_ids)) == 3
    assert set(settings.mode_ids) <= offered_rounds
    for entry in settings.modes:
        assert entry.questions == questions_bounds(entry.mode).default


def test_surprise_modes_hide_every_round_from_the_admin_too(table) -> None:
    game = surprise_modes(table)
    room = game.room.view_for(UUID(game.admin.id)).model_dump(mode="json")
    assert room["settings"]["modes"] == []
    assert room["rounds"] == 3
    assert room["settings"]["surprise_modes"] == 3
    play_until(game, finished)
    admin = [m["room"] for m in game.admin.seen if m["t"] == "room_updated"]
    player = [m["room"] for m in frames_until_finished(game.players[0]) if m["t"] == "room_updated"]
    assert [played_modes(r) for r in admin] == [played_modes(r) for r in player]
    assert played_modes(admin[-1]) == game.room.settings.mode_ids


def test_a_rematch_draws_its_surprise_rounds_again(table) -> None:
    game = surprise_modes(table)
    # The room is over once it says so; another skip after that would name no phase.
    play_until(game, lambda m: finished(m) or m.get("room", {}).get("status") == "finished")
    game.admin.send(t="rematch")
    lobby = updated(game.admin, lambda m: m["t"] == "room_updated" and in_lobby(m))
    assert lobby["room"]["settings"]["modes"] == []
    assert lobby["room"]["rounds"] == 3
    assert game.room.settings.modes == []
    assert game.room.settings.hide_rounds is True
    game.started = False
    game.start()
    assert len(set(game.room.settings.mode_ids)) == 3


def test_surprise_modes_refuse_picked_modes_alongside(client) -> None:
    response = client.post(
        "/api/rooms",
        json={
            "returning": False,
            "display_name": "Admin",
            "settings": {"surprise_modes": 2, "modes": [{"mode": "more_less"}]},
        },
    )
    assert response.status_code == 422


def test_surprise_modes_refuse_more_modes_than_are_offered(client) -> None:
    offered_rounds = [
        m for m in offered(client.app.state.settings, client.app.state.packs) if m.is_round
    ]
    response = client.post(
        "/api/rooms",
        json={
            "returning": False,
            "display_name": "Admin",
            "settings": {"surprise_modes": len(offered_rounds) + 1},
        },
    )
    assert response.status_code == 422
    assert client.app.state.rooms.rooms == {}
