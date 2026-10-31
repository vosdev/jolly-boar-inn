"""With one-second questions and ``reveal_seconds = 1`` a 3-question room
runs to ``finished`` unattended; an answer after the close is ``not_open``; a second
answer is ``already_answered``; all-answered closes early; ``start_game`` from a
non-admin is ``not_admin``; ``skip`` during a question closes within 100 ms.

The database half of scoring (the bucket and standings tables are in test_scoring.py):
grading writes ``correct`` and ``points``, ``question_closed`` carries the per-player
results, the sum held in memory equals ``sum(points)`` from the database after every
close, and ``host_only`` and the author of a room question cannot answer.

Restart recovery: a game is killed mid-question (the room dropped from memory and its timer
cancelled, which is what the next ``get`` sees after a process restart); the question comes
back voided, a reconnecting player's ``welcome`` has ``question = null`` and
``phase = reveal``, and the next question opens ``reveal_seconds`` later.

The game half of credit (the tables are in test_scoring.py): a ``more_less`` game scores
the same fixed standings it scored before credit existed, and a type's ``SCORING`` reaches
both ``answer_ack`` and the close.

Plus the rest of the section 3 and 4 surface this file owns: ``question_open`` (and
what it withholds), ``answer_ack``, auto-advance, ``game_finished``, reconnecting
mid-question, ``skip`` during a reveal, ``end_game``, ``promote`` and ``kick``. And what the
timer does when a step fails, when it loses a race for the lock, and when the wall clock
jumps.

Most tests run with ten-second questions and drive the closes themselves with ``skip``,
so what they assert is the state machine and not the wall clock. The ones that are about
time say so, and play one-second questions.
"""

import math
import time
from collections.abc import Callable, Iterator
from contextlib import ExitStack
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID, uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.modes import MODES, round_modes
from app.questions.types import (
    TYPES,
    answer_seconds,
    more_less,
    multiple_choice,
    reveal_seconds,
)
from app.questions.types.scoring import Scoring
from app.random_events import RANDOM_EVENTS
from app.rooms import loop, state
from app.rooms.duration import NAMES_SECONDS
from app.rooms.errors import BadState, Excluded
from app.rooms.lobby import CHANGE_COOLDOWN
from app.rooms.loop import ALL_ANSWERED_PAUSE_SECONDS, question_hold
from app.rooms.models import RoomQuestion
from app.rooms.ready import EVERYONE_READY_SECONDS, THRESHOLD_SECONDS
from app.ws.outbox import SEND_TIMEOUT
from tests.conftest import stub_mode
from tests.game_api import (
    AFTER,
    Game,
    Seat,
    acked,
    answer_after,
    assert_memory_matches_db,
    at,
    closed_after,
    db_totals,
    left_memory,
    lock_held,
    ready_of,
    reply,
    reseat,
    seconds_left,
    tap,
    updated,
)
from tests.rooms_api import StalledSocket, call, closed_with, create_fast, join


@pytest.fixture
def game(table) -> Game:
    """One round of three ten-second questions, an admin and two players, connected."""
    return table("Zezima", "Woox", seconds=10, reveal_seconds=1)


# --- the loop runs itself ------------------------------------------------------------


def test_a_three_question_game_runs_to_finished_unattended(table, db) -> None:
    """One-second questions and reveals, three questions, nobody touching anything."""
    game = table("Zezima", "Woox", seconds=1, reveal_seconds=1)
    game.start()
    started = time.monotonic()
    for index in range(3):
        game.opened(index)
        closed = [seat.take("question_closed") for seat in game.seats]
        assert all(message == closed[0] for message in closed)
        # The last reveal is timed too; its end is the game's.
        assert closed[0]["next_at"] is not None, closed[0]
    finals = [seat.take("game_finished") for seat in game.seats]
    assert all(message == finals[0] for message in finals)
    assert [s["points"] for s in finals[0]["standings"]] == [0, 0, 0]  # nobody answered
    assert [s["rank"] for s in finals[0]["standings"]] == [1, 1, 1]

    elapsed = time.monotonic() - started
    # Three questions and three reveals are six seconds; twice that is still well short of
    # the eighteen that questions held to ``more_less``'s five-second floor would take.
    assert 3 <= elapsed < 12, f"three 1s questions and reveals took {elapsed:.1f}s"
    room = game.room
    assert room.status == "finished"
    assert room.phase == "idle"
    assert room.timer is None
    assert all(question.closed_at is not None for question in room.questions)
    assert not any(question.voided for question in room.questions)
    assert [row["status"] for row in db("select status from rooms")] == ["finished"]
    assert game.client.get(f"/api/rooms/{game.code}").json()["status"] == "finished"


def test_the_next_question_opens_when_question_closed_said_it_would(table) -> None:
    game = table("Zezima", seconds=1, reveal_seconds=1)
    game.start()
    game.opened(0)
    closed = game.admin.take("question_closed")
    next_at = datetime.fromisoformat(closed["next_at"])
    opened = game.admin.take("question_open")
    opened_at = datetime.fromisoformat(opened["question"]["opened_at"])
    assert opened["question"]["index"] == 1
    assert abs((opened_at - next_at).total_seconds()) < 0.5


def _leaves(node: Any) -> Iterator[Any]:
    """Every scalar in a decoded JSON frame, however deep."""
    if isinstance(node, dict):
        for child in node.values():
            yield from _leaves(child)
    elif isinstance(node, list):
        for child in node:
            yield from _leaves(child)
    else:
        yield node


def test_question_open_is_the_same_frame_for_everyone_and_withholds_the_answer(game) -> None:
    """Section 3: the admin's ``question_open`` is the players', and neither has the answer."""
    game.start()
    opened = game.opened(0)
    assert all(message == opened[0] for message in opened)
    question = game.question(0)
    view = opened[0]["question"]
    assert view["question_id"] == str(question.id)
    assert view["type"] == "more_less"
    assert view["total"] == 3
    assert view["you_can_answer"] is True
    assert view["view"] == more_less.client_view(question.payload)
    assert "answer_index" not in view["view"]
    assert all("value" not in option for option in view["view"]["options"])
    # Compared as values, not as text: a substring check finds a 2 gp Fire rune in the
    # year of every timestamp, and the room draws its questions unseeded.
    shown = set(_leaves(view["view"]))
    for option in question.payload["options"]:
        assert option["value"] not in shown
    ends_at = datetime.fromisoformat(view["ends_at"])
    opened_at = datetime.fromisoformat(view["opened_at"])
    assert (ends_at - opened_at).total_seconds() == 10
    assert game.room.phase == "open"


def test_frames_name_a_question_by_its_row_id_and_never_its_content_id(game) -> None:
    """The content id hashes the payload, answer included, so a client that saw it could
    hash each candidate answer until one matched."""
    game.start()
    opened = game.opened(0)
    question = game.question(0)
    player = game.players[0]
    game.answer(player, 0, game.right(0))
    player.take("answer_ack")
    game.admin.take("answer_count")
    game.skip()
    for seat in game.seats:
        seat.take("question_closed")
    frames = [message for seat in game.seats for message in seat.seen]
    named = [(m.get("question") or m).get("question_id") for m in frames]
    # Three opens, the ack, two counts and three closes.
    assert len([n for n in named if n]) == 9
    assert {n for n in named if n} == {str(question.id)} and opened[0] in frames
    assert all(question.content_id not in _leaves(message) for message in frames)


def test_non_admin_cannot_start_the_game(game) -> None:
    """``start_game`` from a player is ``not_admin``."""
    player = game.players[0]
    player.send(t="start_game")
    assert player.take("error") == {
        "t": "error",
        "code": "not_admin",
        "message": "only an admin can do that",
    }
    assert game.room.status == "lobby"
    assert game.room.timer is None


def test_room_updated_reaches_everyone_before_the_first_question(app, client) -> None:
    """Nobody may see ``question_open`` before they know the game started, and a second
    ``start_game`` finds the room already playing."""
    room, _, session = create_fast(app, client)
    with client.websocket_connect(f"/ws/{room.code}") as ws:
        ws.send_json({"t": "hello", "session": session})
        assert ws.receive_json()["t"] == "welcome"
        ws.send_json({"t": "start_game"})
        update = ws.receive_json()
        assert update["t"] == "room_updated"
        assert update["room"]["status"] == "playing"
        assert update["room"]["current_index"] == 0
        assert ws.receive_json()["t"] == "question_open"
        ws.send_json({"t": "start_game"})
        error = ws.receive_json()
        assert error["t"] == "error" and error["code"] == "bad_state"


def test_start_game_needs_somebody_connected(app, client) -> None:
    """Section 4's guard: at least one connected player.

    ``create`` hands back the admin directly, so this never launders them through
    ``room.players`` -- a ``create`` that failed to cache its admin fails here.
    """
    room, admin, _ = create_fast(app, client)
    manager = app.state.rooms
    with pytest.raises(BadState) as info:
        call(client, manager.start_game, room.code, admin)
    assert info.value.message == "nobody but the TV is connected to play"
    assert call(client, manager.get, room.code).status == "lobby"


def test_start_game_needs_questions(app, client) -> None:
    """Section 4's other guard. Only reachable with a room built behind the API's back."""
    room, _, session = create_fast(app, client, questions=0)
    manager = app.state.rooms
    assert call(client, manager.get, room.code).questions == []
    with client.websocket_connect(f"/ws/{room.code}") as ws:
        ws.send_json({"t": "hello", "session": session})
        assert ws.receive_json()["t"] == "welcome"
        ws.send_json({"t": "start_game"})
        error = ws.receive_json()
        assert error["t"] == "error" and error["code"] == "bad_state"
    assert call(client, manager.get, room.code).status == "lobby"


# --- answering -----------------------------------------------------------------------


def test_the_answer_row_is_committed_before_the_ack(game, db) -> None:
    """The ack means the row is in Postgres, ungraded until the close."""
    game.start()
    game.opened(0)
    player = game.players[0]
    game.answer(player, 0, game.right(0))
    ack = player.take("answer_ack")
    assert ack == {
        "t": "answer_ack",
        "question_id": str(game.question(0).id),
        "scoring": "speed",
        "band": 1,
        "answered": 1,
        "of": 3,
    }
    rows = db("select player_id, value, received_at, correct, points from answers")
    assert len(rows) == 1
    assert rows[0]["player_id"] == UUID(player.id)
    assert rows[0]["value"] == game.right(0)
    assert rows[0]["received_at"] is not None
    assert rows[0]["correct"] is None  # grading is the close's job
    assert rows[0]["points"] is None


def test_everyone_else_hears_the_answer_count(game) -> None:
    """The waiting state's "2 of 3 answered", with who is still to answer and never what.

    The answerer hears the count on their ack, so the broadcast leaves them out.
    """
    game.start()
    for opened in game.opened(0):
        assert (opened["question"]["answered"], opened["question"]["of"]) == (0, 3)
    first, second, third = game.seats
    game.answer(first, 0, game.right(0))
    assert first.take("answer_ack")["answered"] == 1
    for seat in (second, third):
        count = seat.take("answer_count")
        assert count == {
            "t": "answer_count",
            "question_id": str(game.question(0).id),
            "answered": 1,
            "of": 3,
            "waiting": [second.id, third.id],
        }
    game.answer(second, 0, game.wrong(0))
    ack = second.take("answer_ack")
    assert (ack["answered"], ack["of"]) == (2, 3)
    assert third.take("answer_count")["waiting"] == [third.id]
    # Each heard only the other's answer counted, never their own.
    assert "answer_count" not in first.kinds
    assert second.kinds.count("answer_count") == 1


def test_a_second_answer_is_already_answered(game) -> None:
    """One answer per player per question."""
    game.start()
    game.opened(0)
    player = game.players[0]
    game.answer(player, 0, game.right(0))
    player.take("answer_ack")
    game.answer(player, 0, game.wrong(0))
    assert player.take("error")["code"] == "already_answered"
    assert len(game.question(0).answers) == 1


def test_an_answer_after_the_close_is_not_open(table) -> None:
    """Answering a question that has closed is ``not_open``, never scored."""
    game = table("Zezima", seconds=1, reveal_seconds=30)
    game.start()
    game.opened(0)
    player = game.players[0]
    question_id = str(game.question(0).id)
    player.take("question_closed")
    player.send(t="answer", question_id=question_id, value=game.right(0))
    assert player.take("error")["code"] == "not_open"
    assert game.question(0).answers == {}


def test_an_answer_for_another_question_is_not_open(game) -> None:
    game.start()
    game.opened(0)
    player = game.players[0]
    player.send(t="answer", question_id=str(game.question(1).id), value=game.right(1))
    assert player.take("error")["code"] == "not_open"


def test_an_answer_that_is_not_a_valid_value_is_bad_value(game) -> None:
    game.start()
    game.opened(0)
    player = game.players[0]
    for value in ("sideways", 3, None, {"higher": True}):
        game.answer(player, 0, value)
        assert player.take("error")["code"] == "bad_value", value
    assert game.question(0).answers == {}


@pytest.fixture
def picked_round(app: FastAPI, client: TestClient) -> Iterator[str]:
    """A round of ``pick_from_list`` questions on the item roster, which no round plays yet."""
    questions = [
        {
            "id": f"q_picked_{item_id}",
            "type": "pick_from_list",
            "source": "pack",
            "tags": [],
            "payload": {
                "prompt": f"Which item is number {item_id}?",
                "vocab": "items",
                "answer_id": item_id,
                "subject": {"name": name},
            },
        }
        for item_id, name in ((4151, "Abyssal whip"), (4587, "Dragon scimitar"))
    ]
    yield from stub_mode(app, "picked_round", "pick_from_list", questions)


def test_a_pick_from_list_answer_must_be_an_id_in_its_vocabulary(table, picked_round) -> None:
    """Typed text is a search, never an answer, and an id the list does not hold is
    as malformed as a string. A real entry that is not the answer is merely wrong, and a
    question with no ``steps`` acks on speed."""
    game = table("Zezima", "Woox", modes=[picked_round], seconds=10)
    game.start()
    game.opened(0)
    zezima, woox = game.players
    payload = game.question(0).payload
    for value in (payload["subject"]["name"], str(payload["answer_id"]), 999999, None):
        game.answer(zezima, 0, value)
        assert zezima.take("error")["code"] == "bad_value", value
    assert game.question(0).answers == {}
    game.answer(zezima, 0, payload["answer_id"])
    assert zezima.take("answer_ack")["scoring"] == "speed"
    game.answer(woox, 0, game.wrong(0))
    woox.take("answer_ack")
    game.skip()
    results = game.admin.take("question_closed")["results"]
    by_name = {seat.player["id"]: seat.name for seat in game.players}
    assert {by_name[pid]: r["correct"] for pid, r in results.items()} == {
        "Zezima": True,
        "Woox": False,
    }


def test_answering_before_the_game_starts_is_not_open(game) -> None:
    player = game.players[0]
    player.send(t="answer", question_id=str(uuid4()), value="higher")
    assert player.take("error")["code"] == "not_open"


def test_all_answered_closes_the_question_early(game) -> None:
    """With ``close_when_all_answered`` the question closes when everyone has answered."""
    game.start()
    game.opened(0)
    started = time.monotonic()
    for seat in game.seats:  # the admin is a player with a flag, so they answer too
        game.answer(seat, 0, game.right(0))
        seat.take("answer_ack")
    closed = game.admin.take("question_closed")
    assert time.monotonic() - started < 5  # not the 30 seconds the question had left
    assert len(closed["results"]) == 3
    assert game.room.phase == "reveal"


def test_everyone_answering_early_holds_the_question_a_second_before_the_reveal(table) -> None:
    pause = ALL_ANSWERED_PAUSE_SECONDS
    assert pause == 1.0
    game = table("Zezima", "Woox", seconds=10, all_answered_pause=pause)
    game.start()
    game.opened(0)
    for seat in game.seats:
        game.answer(seat, 0, game.right(0))
        seat.take("answer_ack")
    answered = time.monotonic()
    game.admin.take("question_closed")
    assert pause <= time.monotonic() - answered < pause + 2


def test_a_skipped_question_closes_without_the_pause(table) -> None:
    game = table("Zezima", "Woox", seconds=30, all_answered_pause=5)
    game.start()
    game.opened(0)
    game.answer(game.admin, 0, game.right(0))
    game.admin.take("answer_ack")
    started = time.monotonic()
    game.skip()
    game.admin.take("question_closed")
    assert time.monotonic() - started < 3


def test_a_disconnected_player_does_not_hold_the_close_up(game) -> None:
    """Section 4: the early close waits for the connected players, not the whole roster."""
    game.start()
    game.opened(0)
    absent = game.players[1]
    absent.ws.close()
    update = game.admin.take("players_updated")
    assert [p["connected"] for p in update["players"]] == [True, True, False]
    for seat in (game.admin, game.players[0]):
        game.answer(seat, 0, game.right(0))
        seat.take("answer_ack")
    closed = game.admin.take("question_closed")
    assert set(closed["results"]) == {game.admin.id, game.players[0].id}


@pytest.mark.parametrize("leaves", ["disconnects", "is kicked"])
def test_the_last_player_owing_an_answer_leaving_closes_the_question(game, leaves) -> None:
    """Section 4: the others answer first and the last phone then locks, or the host kicks
    its owner. Nobody connected is owed the question any more, so it closes now."""
    game.start()
    game.opened(0)
    for seat in (game.admin, game.players[0]):
        game.answer(seat, 0, game.right(0))
        seat.take("answer_ack")
    started = time.monotonic()
    last = game.players[1]
    if leaves == "disconnects":
        last.ws.close()
    else:
        game.admin.send(t="kick", player_id=last.id)
    closed = game.admin.take("question_closed")
    assert time.monotonic() - started < 5  # not the ten seconds the question had
    assert set(closed["results"]) == {game.admin.id, game.players[0].id}


@pytest.mark.parametrize("leaves", ["disconnects", "is kicked"])
def test_a_player_leaving_while_another_still_owes_an_answer_keeps_it_open(game, leaves) -> None:
    game.start()
    game.opened(0)
    game.answer(game.admin, 0, game.right(0))
    game.admin.take("answer_ack")
    last = game.players[1]
    if leaves == "disconnects":
        last.ws.close()
    else:
        game.admin.send(t="kick", player_id=last.id)
    # The leave is checked under the lock before this frame goes out, so a close it asked
    # for shows here as ``advance`` set or the question already closed.
    game.admin.take("players_updated" if leaves == "disconnects" else "room_updated")
    room = game.room
    assert (room.phase, room.advance.is_set()) == ("open", False)


def test_an_unanswered_seat_keeps_the_question_open(game) -> None:
    """The early close waits for every connected player who can answer.

    An answer that leaves nobody owing one wakes the timer before its ack goes out, so a
    close it asked for shows here as ``advance`` set or the question already closed.
    """
    game.start()
    game.opened(0)
    for seat in game.seats[:2]:
        game.answer(seat, 0, game.right(0))
        seat.take("answer_ack")
    room = game.room
    assert (room.phase, room.advance.is_set()) == ("open", False)
    last = game.seats[2]
    game.answer(last, 0, game.right(0))
    last.take("answer_ack")
    assert game.admin.take("question_closed")["question_id"] == str(game.question(0).id)


def test_a_stalled_socket_holds_up_nobody_else(table, client) -> None:
    """One phone that has stopped reading: everyone else's acks and the clock run on time."""
    game = table("Zezima", seconds=1, reveal_seconds=1)
    body = join(client, game.code, "Woox").json()
    stalled = StalledSocket()
    call(client, game.app.state.rooms.connect, game.code, body["session"], stalled)
    for seat in game.seats:
        seat.take("players_updated")
    game.start()
    opened = game.opened(0)[0]["question"]
    started = time.monotonic()
    player = game.players[0]
    game.answer(player, 0, game.right(0))
    player.take("answer_ack")
    assert time.monotonic() - started < 1
    closed = game.admin.take("question_closed")
    # Woox is connected and never answers, so nothing closes it early; waiting on Woox's
    # send would have held the close up for the outbox's ten-second send timeout.
    length = datetime.fromisoformat(opened["ends_at"]) - datetime.fromisoformat(opened["opened_at"])
    assert length.total_seconds() == 1
    assert time.monotonic() - started < length.total_seconds() + SEND_TIMEOUT / 2
    assert set(closed["results"]) == {player.id}
    assert stalled.sends == 1  # still on its welcome


# --- skip ----------------------------------------------------------------------------


def test_skip_closes_the_open_question_within_100ms(game) -> None:
    """``skip`` during a question closes it within 100 ms."""
    game.start()
    game.opened(0)
    started = time.monotonic()
    game.skip()
    closed = game.admin.take("question_closed")
    took = time.monotonic() - started
    assert took < 0.1, f"skip took {took * 1000:.0f} ms"
    assert closed["question_id"] == str(game.question(0).id)
    assert game.room.phase == "reveal"


def test_skip_during_the_reveal_opens_the_next_question(table) -> None:
    game = table("Zezima", seconds=10, reveal_seconds=30)
    game.start()
    game.opened(0)
    game.skip()
    game.admin.take("question_closed")
    started = time.monotonic()
    game.skip()
    opened = game.admin.take("question_open")
    assert time.monotonic() - started < 1
    assert opened["question"]["index"] == 1


def test_a_player_cannot_skip(game) -> None:
    game.start()
    game.opened(0)
    game.skip(game.players[0])
    assert game.players[0].take("error")["code"] == "not_admin"
    assert game.room.phase == "open"


def test_skips_during_a_close_never_deadlock_the_room(table) -> None:
    """Section 4: ``skip`` cancels a sleep, it does not fight the timer for the lock.

    Each burst names one phase and lands before, during and after its close. It ends that
    phase and no more, and the ones that find it over get no reply.
    """
    game = table("Zezima", seconds=10, reveal_seconds=10)
    game.start()
    for index in range(3):
        assert game.admin.take("question_open")["question"]["index"] == index
        for _ in range(4):
            game.admin.skip("open", index)
        game.admin.take("question_closed")
        game.admin.settle()
        assert (game.room.phase, game.room.current_index) == ("reveal", index)
        for _ in range(4):
            game.admin.skip("reveal", index)
    finished = game.admin.take("game_finished", limit=80)
    assert len(finished["standings"]) == 2
    assert game.room.status == "finished"
    assert not any(question.voided for question in game.room.questions)
    game.admin.settle()
    assert "error" not in game.admin.kinds


def test_a_double_skip_ends_one_phase_in_every_phase(table, second_mode) -> None:
    """ENG-2: a skip names the phase it was pressed on. A second tap that lands after the
    first has moved the room on names a phase that is over, and nothing happens."""
    game = table(
        "Zezima",
        reveal_seconds=30,
        splash=True,
        standings_seconds=30,
        seconds=30,
        modes=[
            {"mode": "more_less", "questions": 1},
            {"mode": second_mode, "questions": 1},
        ],
    )
    game.start()
    game.splash()
    steps = [
        ("splash", 0, "question_open", ("open", 0)),
        ("open", 0, "question_closed", ("reveal", 0)),
        ("reveal", 0, "room_updated", ("standings", 0)),
        ("standings", 0, "room_updated", ("splash", 1)),
        ("splash", 1, "question_open", ("open", 1)),
        ("open", 1, "question_closed", ("reveal", 1)),
    ]
    for phase, index, announced, after in steps:
        assert (game.room.phase, game.room.current_index) == (phase, index)
        game.admin.skip(phase, index)
        game.admin.take(announced)
        game.admin.skip(phase, index)
        game.admin.settle()
        assert (game.room.phase, game.room.current_index) == after, (phase, index)
    assert "error" not in game.admin.kinds


def test_a_skip_for_another_phase_or_question_does_nothing(table) -> None:
    """Two admins, one a question behind: the skip it sends is for a question already
    over, and a skip that names the wrong phase of this one is just as stale."""
    game = table("Zezima", seconds=30, reveal_seconds=30)
    game.start()
    game.opened(0)
    game.skip()
    game.admin.take("question_closed")
    game.skip()
    game.opened(1)
    for phase, index in (("open", 0), ("reveal", 0), ("reveal", 1), ("splash", 1), ("open", 2)):
        game.admin.skip(phase, index)
    game.admin.settle()
    room = game.room
    assert (room.phase, room.current_index, room.advance.is_set()) == ("open", 1, False)
    assert "error" not in game.admin.kinds
    game.admin.skip("open", 1)
    assert game.admin.take("question_closed")["question_id"] == str(game.question(1).id)


# --- reconnecting mid-game -----------------------------------------------------------


def test_welcome_mid_question_carries_the_question_and_your_answer(game, client) -> None:
    """Section 3: a reconnect rebuilds everything from ``welcome``."""
    game.start()
    opened = game.opened(0)[1]
    player = game.players[0]
    game.answer(player, 0, game.right(0))
    player.take("answer_ack")
    with client.websocket_connect(f"/ws/{game.code}") as again:
        again.send_json({"t": "hello", "session": player.session})
        welcome = again.receive_json()
        assert welcome["t"] == "welcome"
        # The same question, with the count as it stands now rather than at open.
        waiting = [seat.id for seat in game.seats if seat is not player]
        assert welcome["question"] == opened["question"] | {"answered": 1, "waiting": waiting}
        assert welcome["your_answer"] == game.right(0)
        assert welcome["room"]["phase"] == "open"
        assert welcome["room"]["current_index"] == 0
        assert closed_with(player.ws) == 4000  # the old socket, replaced


def test_welcome_after_the_game_still_serves_the_final_standings(table, client) -> None:
    game = table("Zezima", seconds=1, reveal_seconds=1)
    game.start()
    game.opened(0)
    game.answer(game.players[0], 0, game.right(0))
    game.players[0].take("answer_ack")
    final = game.admin.take("game_finished", limit=40)
    with client.websocket_connect(f"/ws/{game.code}") as again:
        again.send_json({"t": "hello", "session": game.players[0].session})
        welcome = again.receive_json()
        assert welcome["standings"] == final["standings"]
        assert welcome["standings"][0]["points"] == 1000
        assert welcome["room"]["status"] == "finished"
        assert welcome["room"]["phase"] == "idle"
        assert welcome["question"] is None


# --- grading and standings -----------------------------------------------------------


def test_the_close_grades_every_answer_and_reveals_the_results(game, db) -> None:
    """``correct`` and ``points`` are written at the close and sent with the reveal."""
    game.start()
    game.opened(0)
    right, wrong = game.players
    game.answer(right, 0, game.right(0))
    right.take("answer_ack")
    game.answer(wrong, 0, game.wrong(0))
    wrong.take("answer_ack")
    game.skip()
    closed = game.admin.take("question_closed")

    assert closed["reveal"] == more_less.reveal(game.question(0).payload)
    assert closed["results"] == {
        right.id: {"value": game.right(0), "correct": True, "credit": 1.0, "points": 1000},
        wrong.id: {"value": game.wrong(0), "correct": False, "credit": 0.0, "points": 0},
    }
    assert game.admin.id not in closed["results"]  # the admin never answered
    assert [
        {k: v for k, v in standing.items() if k != "avatar"} for standing in closed["standings"]
    ] == [
        {**standing, "points_gained": standing["points"], "previous_rank": None}
        for standing in [
            {"player_id": right.id, "display_name": right.name, "points": 1000, "rank": 1},
            {"player_id": game.admin.id, "display_name": "Admin", "points": 0, "rank": 2},
            {"player_id": wrong.id, "display_name": wrong.name, "points": 0, "rank": 2},
        ]
    ]
    for standing in closed["standings"]:
        assert standing["avatar"] is not None
        assert standing["avatar"] == game.room.players[UUID(standing["player_id"])].avatar
    rows = db("select player_id, correct, points from answers order by points desc")
    assert [(row["player_id"], row["correct"], row["points"]) for row in rows] == [
        (UUID(right.id), True, 1000),
        (UUID(wrong.id), False, 0),
    ]
    assert_memory_matches_db(game, db)


def test_the_sum_in_memory_matches_the_database_after_every_close(game, db) -> None:
    """After each close, the in-memory total is ``sum(points)`` from the table."""
    game.start()
    for index in range(3):
        game.opened(index)
        # A different pattern each question, so the running totals actually diverge.
        for offset, seat in enumerate(game.seats):
            if (index + offset) % 3:
                game.answer(seat, index, game.right(index) if offset else game.wrong(index))
                seat.take("answer_ack")
        game.skip()
        closed = game.admin.take("question_closed")
        assert_memory_matches_db(game, db)
        assert closed["standings"] == [
            standing.model_dump(mode="json") for standing in game.room.standings()
        ]
    finished = game.admin.take("game_finished")
    assert finished["standings"] == closed["standings"]
    assert sum(s["points"] for s in finished["standings"]) == sum(db_totals(db, game.code).values())
    assert any(s["points"] > 0 for s in finished["standings"])


def _two_round_game(table, second_mode: str) -> tuple[Game, dict[str, Any]]:
    """Zezima wins round one and scores nothing in round two, which Woox wins."""
    game = table(
        "Zezima", "Woox", reveal_seconds=1, standings_seconds=30, **two_rounds(second_mode)
    )
    zezima, woox = game.players
    game.start()
    for index, (winner, loser) in enumerate([(zezima, woox), (woox, zezima)]):
        game.opened(index)
        game.answer(winner, index, game.right(index))
        winner.take("answer_ack")
        game.answer(loser, index, game.wrong(index))
        loser.take("answer_ack")
        game.skip()
        if index == 0:
            first = game.admin.take("question_closed")["standings"]
            updated(game.admin, lambda m: m["room"]["phase"] == "standings")
            game.skip()
    return game, first


def _gains(game: Game, standings: list[dict[str, Any]]) -> dict[str, tuple[int, int, int | None]]:
    names = {seat.id: seat.name for seat in game.seats}
    return {
        names[s["player_id"]]: (s["points"], s["points_gained"], s["previous_rank"])
        for s in standings
    }


def test_the_standings_say_what_the_round_gained_and_where_everyone_stood_before_it(
    table, second_mode
) -> None:
    """The first round has no rank before it; the next counts from the first's standings."""
    game, first = _two_round_game(table, second_mode)
    assert _gains(game, first) == {
        "Zezima": (1000, 1000, None),
        "Admin": (0, 0, None),
        "Woox": (0, 0, None),
    }
    final = game.admin.take("game_finished")["standings"]
    gains = _gains(game, final)
    woox_points = gains["Woox"][0]
    assert woox_points > 0
    assert gains == {
        "Zezima": (1000, 0, 1),
        "Woox": (woox_points, woox_points, 2),
        "Admin": (0, 0, 2),
    }


def test_a_restart_keeps_the_last_rounds_gains(table, client, second_mode, evict) -> None:
    """The gains are the table's own sums, so a room loaded back has the same ones."""
    game, _ = _two_round_game(table, second_mode)
    final = game.admin.take("game_finished")["standings"]
    assert evict(game.code) is True
    with client.websocket_connect(f"/ws/{game.code}") as again:
        again.send_json({"t": "hello", "session": game.players[0].session})
        assert again.receive_json()["standings"] == final


def test_a_voided_question_is_never_graded(game, db) -> None:
    """Section 4: ``end_game`` voids what is open; its answers stay worth nothing."""
    game.start()
    game.opened(0)
    player = game.players[0]
    game.answer(player, 0, game.right(0))
    player.take("answer_ack")
    game.admin.send(t="end_game")
    finished = game.admin.take("game_finished")

    assert "question_closed" not in game.admin.kinds
    assert [s["points"] for s in finished["standings"]] == [0, 0, 0]
    (question,) = db("select voided, closed_at from questions where position = 0")
    assert question["voided"] is True
    assert question["closed_at"] is not None
    (answer,) = db("select correct, points from answers")
    assert (answer["correct"], answer["points"]) == (None, None)
    assert_memory_matches_db(game, db)
    room = game.room
    assert room.status == "finished"
    assert room.timer is None
    assert room.phase == "idle"


def test_end_game_between_questions_finishes_without_voiding(table, db) -> None:
    game = table("Zezima", seconds=10, reveal_seconds=30)
    game.start()
    game.opened(0)
    game.skip()
    game.admin.take("question_closed")
    game.admin.send(t="end_game")
    game.admin.take("game_finished")
    assert [row["voided"] for row in db("select voided from questions order by position")] == [
        False,
        False,
        False,
    ]


def test_a_player_cannot_end_the_game(game) -> None:
    game.start()
    game.opened(0)
    game.players[0].send(t="end_game")
    assert game.players[0].take("error")["code"] == "not_admin"
    assert game.room.status == "playing"


# --- exclusions ----------------------------------------------------------------------


@pytest.mark.parametrize(
    ("host_only", "source", "is_author", "expected"),
    [
        (False, "pack", False, True),
        (True, "pack", False, False),  # host_only: nobody scores
        (True, "room", True, False),
        (False, "room", False, True),
        (False, "room", True, True),  # the author answers their own
        (False, "community", True, True),
    ],
)
def test_can_answer(host_only: bool, source: str, is_author: bool, expected: bool) -> None:
    """Section 6's exclusions, on their own."""
    player_id = uuid4()
    question = RoomQuestion(
        id=uuid4(),
        position=0,
        content_id="q_x",
        type="more_less",
        mode="more_less",
        source=source,
        payload={},
        host_only=host_only,
        author_player_id=player_id if is_author else uuid4(),
    )
    assert question.can_answer(player_id) is expected


def before_the_first_question(table) -> Game:
    """``game``, started and held on its splash: its questions exist and none has opened."""
    game = table("Zezima", "Woox", seconds=10, reveal_seconds=1, splash=True)
    game.start()
    game.splash()
    return game


def test_a_host_only_question_cannot_be_answered_by_anyone(table, db) -> None:
    """``host_only`` scores nobody, and the question still shows and closes normally."""
    game = before_the_first_question(table)
    game.room.questions[0].host_only = True  # what the Phase 2 editor will store
    game.skip()
    opened = game.opened(0)
    assert all(message["question"]["you_can_answer"] is False for message in opened)
    for seat in game.seats:
        game.answer(seat, 0, game.right(0))
        assert seat.take("error")["code"] == "excluded"
    assert game.room.phase == "open"  # nobody can answer, so it never closes early
    game.skip()
    closed = game.admin.take("question_closed")
    assert closed["results"] == {}
    assert closed["reveal"] == more_less.reveal(game.question(0).payload)
    assert db("select * from answers") == []
    assert_memory_matches_db(game, db)


def test_the_reveal_lists_who_could_answer_and_did_not(table) -> None:
    """``unanswered``: connected and allowed, with no answer in. The author counts like anyone."""
    game = before_the_first_question(table)
    author, other = game.players
    question = game.room.questions[0]
    question.source = "room"
    question.author_player_id = UUID(author.id)
    game.skip()
    game.start()
    game.opened(0)
    game.answer(game.admin, 0, game.wrong(0))
    game.admin.take("answer_ack")
    game.skip()
    closed = game.admin.take("question_closed")
    assert sorted(closed["unanswered"]) == sorted([author.id, other.id])
    assert list(closed["results"]) == [game.admin.id]


def test_naming_wrong_answers_holds_the_reveal_a_second_longer(game) -> None:
    """``NAMES_SECONDS`` on top of the type's reveal at the room's pace, only with the names on."""
    room, question = game.room, game.question(0)
    plain = reveal_seconds(question.type, question.payload, room.settings.pace)
    assert room.settings.name_wrong_answers is True
    assert room.question_reveal_seconds(question) == plain + NAMES_SECONDS
    room.settings = room.settings.model_copy(update={"name_wrong_answers": False})
    assert room.question_reveal_seconds(question) == plain


def test_the_author_of_a_room_question_answers_and_scores_on_it(table, db) -> None:
    """An author is a player like any other on their own question, and holds up the early close."""
    game = before_the_first_question(table)
    author, other = game.players
    question = game.room.questions[0]
    question.source = "room"
    question.author_player_id = UUID(author.id)
    game.skip()
    game.start()
    opened = {seat.name: seat.take("question_open") for seat in game.seats}
    assert {name: frame["question"]["you_can_answer"] for name, frame in opened.items()} == {
        "Admin": True,
        other.name: True,
        author.name: True,
    }
    assert opened[other.name]["question"]["of"] == 3

    for seat in (other, game.admin):
        game.answer(seat, 0, game.right(0))
        seat.take("answer_ack")
    assert game.room.phase == "open"  # only the author is left, and they count
    game.answer(author, 0, game.right(0))
    own = opened[author.name]["question"]["question_id"]
    assert author.take("answer_ack")["question_id"] == own
    closed = game.admin.take("question_closed")
    assert set(closed["results"]) == {author.id, other.id, game.admin.id}
    assert closed["results"][author.id]["correct"] is True
    assert closed["results"][author.id]["points"] > 0
    assert closed["unanswered"] == []
    row = db("select correct, points from answers where player_id = $1", UUID(author.id))
    assert [(r["correct"], r["points"] > 0) for r in row] == [(True, True)]
    assert_memory_matches_db(game, db)


# --- promote and kick ----------------------------------------------------------------


def test_promote_makes_a_player_an_admin(game, db) -> None:
    player = game.players[0]
    game.admin.send(t="promote", player_id=player.id)
    update = player.take("room_updated")
    assert [p["role"] for p in update["players"]] == ["admin", "admin", "player"]
    assert db("select role from players where id = $1", UUID(player.id))[0]["role"] == "admin"
    # And a new admin can do admin things.
    player.send(t="start_game")
    assert player.take("question_open")["question"]["index"] == 0


def test_a_player_cannot_promote(game) -> None:
    player, other = game.players
    player.send(t="promote", player_id=other.id)
    assert player.take("error")["code"] == "not_admin"
    assert game.room.players[UUID(other.id)].role == "player"


def test_kick_deletes_the_player_their_answers_and_closes_their_socket(game, db) -> None:
    game.start()
    game.opened(0)
    player = game.players[0]
    game.answer(player, 0, game.right(0))
    player.take("answer_ack")
    assert len(db("select * from answers")) == 1

    game.admin.send(t="kick", player_id=player.id)
    assert closed_with(player.ws) == 4003
    update = game.admin.take("room_updated")
    assert [p["display_name"] for p in update["players"]] == ["Admin", game.players[1].name]
    assert db("select * from answers") == []  # cascaded with the player row
    assert db("select * from players where id = $1", UUID(player.id)) == []
    room = game.room
    assert UUID(player.id) not in room.players
    assert UUID(player.id) not in room.sockets
    assert [s.player_id for s in room.standings()] == [
        UUID(game.admin.id),
        UUID(game.players[1].id),
    ]
    assert_memory_matches_db(game, db)


def test_an_answer_that_waited_out_a_kick_is_excluded_not_a_database_error(game, db) -> None:
    """The kick holds the room lock while the answer waits on it; the player is gone after."""
    game.start()
    game.opened(0)
    manager, room = game.app.state.rooms, game.room
    admin = room.players[UUID(game.admin.id)]
    kicked = room.players[UUID(game.players[0].id)]
    question_id = str(game.question(0).id)

    call(game.client, manager.kick, game.code, admin, kicked.id)
    with pytest.raises(Excluded, match="no longer in this room"):
        call(game.client, manager.submit_answer, game.code, kicked, question_id, game.right(0))
    assert db("select * from answers") == []


def test_an_admin_cannot_be_kicked(game) -> None:
    game.admin.send(t="kick", player_id=game.admin.id)
    assert game.admin.take("error")["code"] == "bad_state"
    game.admin.send(t="promote", player_id=game.players[0].id)
    game.admin.take("room_updated")
    game.admin.send(t="kick", player_id=game.players[0].id)
    assert game.admin.take("error")["code"] == "bad_state"
    assert len(game.room.players) == 3


def test_a_player_cannot_kick(game) -> None:
    player, other = game.players
    player.send(t="kick", player_id=other.id)
    assert player.take("error")["code"] == "not_admin"
    assert len(game.room.players) == 3


@pytest.mark.parametrize("command", ["promote", "kick"])
def test_promote_or_kick_of_nobody_in_the_room_is_bad_state(game, db, command: str) -> None:
    game.admin.send(t=command, player_id=str(uuid4()))
    assert game.admin.take("error")["code"] == "bad_state"
    assert len(game.room.players) == 3
    assert [row["role"] for row in db("select role from players order by joined_at")] == [
        "admin",
        "player",
        "player",
    ]


def test_promoting_an_admin_changes_nothing_and_says_nothing(game, db) -> None:
    game.admin.send(t="promote", player_id=game.admin.id)
    game.admin.settle()
    assert "room_updated" not in game.admin.kinds
    assert "error" not in game.admin.kinds
    assert game.room.players[UUID(game.admin.id)].role == "admin"
    assert len(db("select * from players where role = 'admin'")) == 1


@pytest.mark.parametrize("command", ["set_profile", "set_ready"])
def test_a_command_that_waited_out_its_senders_kick_is_bad_state(game, command: str) -> None:
    """Like an answer that waited out a kick: the player is gone by the time it runs."""
    manager, room = game.app.state.rooms, game.room
    admin = room.players[UUID(game.admin.id)]
    kicked = room.players[UUID(game.players[0].id)]
    call(game.client, manager.kick, game.code, admin, kicked.id)
    args = ("Renamed", None) if command == "set_profile" else (True,)
    with pytest.raises(BadState, match="no longer in this room"):
        call(game.client, getattr(manager, command), game.code, kicked, *args)
    assert [p.display_name for p in game.room.players.values()] == ["Admin", "Woox"]


def test_a_kick_during_the_reveal_drops_the_player_and_the_game_plays_on(table, db) -> None:
    game = table("Zezima", "Woox", seconds=10, reveal_seconds=30)
    zezima, woox = game.players
    game.start()
    game.opened(0)
    game.answer(zezima, 0, game.right(0))
    zezima.take("answer_ack")
    game.skip()
    assert game.admin.take("question_closed")["standings"][0]["player_id"] == zezima.id

    game.admin.send(t="kick", player_id=zezima.id)
    assert closed_after(zezima) == 4003
    update = game.admin.take("room_updated")
    assert update["room"]["phase"] == "reveal"
    assert [p["display_name"] for p in update["players"]] == ["Admin", woox.name]
    assert [s.player_id for s in game.room.standings()] == [UUID(game.admin.id), UUID(woox.id)]
    assert_memory_matches_db(game, db)
    game.skip()
    opened = game.admin.take("question_open")["question"]
    assert (opened["index"], opened["of"]) == (1, 2)


def test_a_kick_during_the_standings_drops_the_player_and_the_next_round_opens(
    table, db, second_mode
) -> None:
    game = table(
        "Zezima", "Woox", reveal_seconds=1, standings_seconds=30, **two_rounds(second_mode)
    )
    zezima = game.players[0]
    game.start()
    game.opened(0)
    game.answer(zezima, 0, game.right(0))
    zezima.take("answer_ack")
    game.skip()
    game.admin.take("question_closed")
    updated(game.admin, lambda m: m["room"]["phase"] == "standings")

    game.admin.send(t="kick", player_id=zezima.id)
    assert closed_after(zezima) == 4003
    update = game.admin.take("room_updated")
    assert update["room"]["phase"] == "standings"
    assert zezima.name not in [p["display_name"] for p in update["players"]]
    assert_memory_matches_db(game, db)
    game.skip()
    opened = game.admin.take("question_open")["question"]
    assert (opened["index"], opened["of"]) == (1, 2)
    game.skip()
    game.admin.take("question_closed")
    game.skip()
    finished = game.admin.take("game_finished")
    assert zezima.id not in [s["player_id"] for s in finished["standings"]]


def test_a_player_who_first_connects_mid_question_counts_and_is_scored(table, client) -> None:
    """Section 4 lets nobody new join a game under way; somebody who joined in the lobby
    and only now connects is not new, and answers the question already up."""
    game = table("Zezima", seconds=10)
    late = join(client, game.code, "Lynx").json()  # in the lobby, connecting later
    game.start()
    for opened in game.opened(0):
        assert opened["question"]["of"] == 2
    with client.websocket_connect(f"/ws/{game.code}") as ws:
        lynx = reseat(Seat("Lynx", late["session"], late["player"], ws), ws)
        welcome = lynx.take("welcome")
        assert (welcome["question"]["index"], welcome["question"]["of"]) == (0, 3)
        game.answer(lynx, 0, game.right(0))
        ack = lynx.take("answer_ack")
        assert (ack["answered"], ack["of"]) == (1, 3)
        game.skip()
        result = lynx.take("question_closed")["results"][lynx.id]
    assert result["correct"] is True
    assert result["points"] > 0


# --- set_profile mid-game -------------------------------------------------------------


def test_a_rename_mid_game_is_refused_and_changes_nothing(game, db) -> None:
    """Names are fixed once the game starts, so nobody loses track of who is ahead."""
    game.start()
    game.opened(0)
    player = game.players[0]
    kept = game.room.players[UUID(player.id)].avatar
    assert kept is not None
    player.send(t="set_profile", display_name="RenamedMid", avatar="aggy")
    assert player.take("error")["code"] == "bad_state"
    renamed = game.room.players[UUID(player.id)]
    assert (renamed.display_name, renamed.avatar) == ("Zezima", kept)
    row = db("select display_name, avatar from players where id = $1", UUID(player.id))
    assert (row[0]["display_name"], row[0]["avatar"]) == ("Zezima", kept)


# --- restart recovery ----------------------------------------------------------------


def test_a_restart_mid_question_voids_it_and_resumes_in_reveal(table, client, db, evict) -> None:
    """The process dies with a question open.

    ``evict`` is the crash: the room leaves memory and its timer task is cancelled, so the
    next lookup rehydrates from Postgres exactly as a fresh process would, and the first
    player back resumes it.
    """
    game = table("Zezima", seconds=10, reveal_seconds=3)
    game.start()
    game.opened(0)
    player = game.players[0]
    game.answer(player, 0, game.right(0))
    player.take("answer_ack")
    game.admin.take("answer_count")  # read, so the close below is the next frame
    question_id = str(game.question(0).id)

    assert evict(game.code) is True
    for seat in game.seats:
        assert closed_with(seat.ws) == 1012

    before = datetime.now(UTC)
    with client.websocket_connect(f"/ws/{game.code}") as ws:
        again = reseat(player, ws)
        welcome = again.take("welcome")  # the first player back, and with it the recovery
        room = game.room
        assert room.questions[0].voided is True
        assert room.questions[0].closed_at is not None
        assert room.phase == "reveal"
        assert room.current_index == 0  # still the voided question's; the reveal is its
        assert room.timer is not None
        # A whole fresh reveal, measured from the restart rather than from the old open.
        # Held in a local: ``room`` is live, and opening the next question clears it.
        next_at = room.next_at
        assert next_at is not None
        reveal = (next_at - before).total_seconds()
        assert room.reveal_seconds == 3
        assert 3 <= reveal < 3 + 2

        assert welcome["question"] is None  # nothing is open, so nothing to answer
        assert welcome["your_answer"] is None
        assert welcome["room"]["phase"] == "reveal"
        assert welcome["room"]["status"] == "playing"
        assert welcome["room"]["current_index"] == 0
        # The reveal a reconnect arrives into has no ``question_closed`` to carry its
        # deadline, so ``welcome`` is the only place the countdown can come from.
        assert datetime.fromisoformat(welcome["room"]["next_at"]) == next_at
        assert welcome["room"]["reveal_seconds"] == 3
        assert [s["points"] for s in welcome["standings"]] == [0, 0]  # the void scored nobody

        (stored,) = db("select voided, closed_at from questions where position = 0")
        assert stored["voided"] is True
        assert stored["closed_at"] is not None
        (answer,) = db("select correct, points from answers")
        assert (answer["correct"], answer["points"]) == (None, None)  # voided, never graded

        # And the game carries on: the next question opens when the reveal said it would.
        opened = again.take("question_open")
        assert opened["question"]["index"] == 1
        assert opened["question"]["question_id"] != question_id
        opened_at = datetime.fromisoformat(opened["question"]["opened_at"])
        assert abs((opened_at - next_at).total_seconds()) < 0.5
        assert "question_closed" not in again.kinds  # a voided question never reveals results
    assert db("select current_index from rooms")[0]["current_index"] == 1


def test_a_restart_between_questions_voids_nothing_and_still_reveals(
    table, client, db, evict
) -> None:
    """No question was open at the restart, so there is nothing to void, and nobody
    has a question opened on them the instant they reconnect either."""
    game = table("Zezima", seconds=10, reveal_seconds=30)
    game.start()
    game.opened(0)
    player = game.players[0]
    game.answer(player, 0, game.right(0))
    player.take("answer_ack")
    game.skip()
    for seat in game.seats:
        seat.take("question_closed")
    assert game.room.phase == "reveal"

    assert evict(game.code) is True
    for seat in game.seats:
        assert closed_with(seat.ws) == 1012

    with client.websocket_connect(f"/ws/{game.code}") as ws:
        admin = reseat(game.admin, ws)
        welcome = admin.take("welcome")
        room = game.room
        assert not any(question.voided for question in room.questions)
        assert room.questions[0].closed_at is not None
        assert room.phase == "reveal"
        assert room.current_index == 0
        assert room.score(UUID(player.id)).points == 1000  # what was graded stays graded
        assert welcome["question"] is None
        assert welcome["room"]["phase"] == "reveal"
        assert [s["points"] for s in welcome["standings"]] == [1000, 0]
        # The resumed timer is a running timer: ``skip`` cuts its reveal short.
        game.skip(admin)
        assert admin.take("question_open")["question"]["index"] == 1
    assert db("select voided from questions where position = 0")[0]["voided"] is False


def test_a_restart_before_the_first_question_opened_still_plays_it(
    table, client, db, evict
) -> None:
    """The gap inside ``start_game``, where ``playing`` and ``current_index = 0`` are
    in the database before question 0 is stamped ``shown_at``.

    A restart in there has nothing to void and is still owed that question, so the reveal
    ends by opening it rather than skipping past it. A splash holds the room in that same
    state, and for longer: the window itself is too narrow to hit on purpose.
    """
    game = table("Zezima", seconds=10, reveal_seconds=30, splash=True)
    game.start()
    game.splash()
    game.app.state.rooms.splashes = False
    assert evict(game.code) is True
    for seat in game.seats:
        assert closed_with(seat.ws, drain=True) == 1012

    with client.websocket_connect(f"/ws/{game.code}") as ws:
        admin = reseat(game.admin, ws)
        assert admin.take("welcome")["question"] is None
        room = game.room
        assert room.status == "playing"
        assert room.phase == "reveal"
        assert room.current_index == 0
        assert room.questions[0].shown_at is None
        assert not any(question.voided for question in room.questions)
        game.skip(admin)
        opened = admin.take("question_open")
        assert opened["question"]["index"] == 0  # the question the restart owed
    assert db("select current_index from rooms")[0]["current_index"] == 0


# --- the splash: a round's mode, introduced once ------------------------------------


def test_the_first_round_is_introduced_before_its_first_question(table) -> None:
    """The splash holds the room until it is ready, then the question opens."""
    game = table("Zezima", seconds=10, splash=True)
    game.start()
    update = game.splash()
    room = update["room"]
    assert room["phase"] == "splash"
    assert room["status"] == "playing"
    assert room["current_index"] == 0
    assert room["segment"] == {
        "mode": "more_less",
        "index": 0,
        "total": 1,  # three questions, five to a round
        "start": 0,
        "count": 3,
    }
    assert room["next_at"] is None  # no clock: it waits for the room
    for seat in game.seats:
        seat.send(t="ready", ready=True)
    ends_at = datetime.fromisoformat(
        updated(game.admin, lambda m: all(ready_of(m).values()))["room"]["next_at"]
    )
    opened = game.admin.take("question_open")
    assert opened["question"]["index"] == 0
    assert datetime.fromisoformat(opened["question"]["opened_at"]) >= ends_at - timedelta(
        milliseconds=200
    )


def test_every_question_carries_the_round_it_belongs_to(table, second_mode) -> None:
    game = table(
        "Zezima",
        seconds=10,
        reveal_seconds=1,
        modes=[
            {"mode": "more_less", "questions": 2},
            {"mode": second_mode, "questions": 1},
        ],
    )
    game.start()
    first = game.opened(0)[0]["question"]
    assert first["segment"] == {
        "mode": "more_less",
        "index": 0,
        "total": 2,  # two modes, so two rounds
        "start": 0,
        "count": 2,
    }
    game.skip()
    game.admin.take("question_closed")
    game.skip()
    second = game.admin.take("question_open")["question"]
    assert second["segment"] == first["segment"]  # same round, second question


def test_a_mode_is_a_round_and_every_round_is_introduced(table, second_mode) -> None:
    """The headline: two modes are two rounds, in the order the host listed them, each
    with a splash of its own because each plays something the one before it did not."""
    game = table(
        "Zezima",
        reveal_seconds=1,
        splash=True,
        seconds=10,
        modes=[
            {"mode": second_mode, "questions": 1},
            {"mode": "more_less", "questions": 1},
        ],
    )
    game.start()
    assert [q.mode for q in game.room.questions] == [second_mode, "more_less"]
    assert game.splash()["room"]["segment"]["mode"] == second_mode
    game.skip()
    game.opened(0)
    game.skip()
    game.admin.take("question_closed")
    game.skip()
    assert game.splash()["room"]["segment"]["mode"] == "more_less"
    game.skip()
    opened = game.admin.take("question_open")["question"]
    assert opened["index"] == 1
    assert opened["segment"] == {
        "mode": "more_less",
        "index": 1,
        "total": 2,
        "start": 1,
        "count": 1,
    }
    splashes = [
        message["room"]["segment"]["mode"]
        for message in game.admin.seen
        if message["t"] == "room_updated" and message["room"]["phase"] == "splash"
    ]
    assert splashes == [second_mode, "more_less"]


def test_question_open_carries_its_mode_beside_its_type(table, second_mode) -> None:
    """Two rounds that answer the same way are still two modes, and every question
    says which one it belongs to as well as how it is answered."""
    game = table(
        "Zezima",
        reveal_seconds=1,
        seconds=10,
        modes=[
            {"mode": "more_less", "questions": 1},
            {"mode": second_mode, "questions": 1},
        ],
    )
    game.start()
    first = game.opened(0)[0]["question"]
    game.skip()
    game.admin.take("question_closed")
    game.skip()
    second = game.admin.take("question_open")["question"]
    assert [(q["type"], q["mode"], q["segment"]["mode"]) for q in (first, second)] == [
        ("more_less", "more_less", "more_less"),
        ("more_less", second_mode, second_mode),
    ]


def test_skip_cuts_the_splash_short(table) -> None:
    game = table("Zezima", seconds=10, splash=True)
    game.start()
    game.splash()
    started = time.monotonic()
    game.skip()
    opened = game.admin.take("question_open")
    assert time.monotonic() - started < 1
    assert opened["question"]["index"] == 0


def test_a_player_cannot_skip_the_splash(table) -> None:
    game = table("Zezima", seconds=10, splash=True)
    game.start()
    game.splash(game.players[0])
    game.skip(game.players[0])
    assert game.players[0].take("error")["code"] == "not_admin"
    assert game.room.phase == "splash"


def test_welcome_during_a_splash_says_so(table, client) -> None:
    """A socket arriving mid-splash is told the same thing a live one was broadcast."""
    game = table("Zezima", seconds=10, splash=True)
    body = join(client, game.code, "Latecomer").json()  # in the lobby, connecting later
    game.start()
    game.splash()
    with client.websocket_connect(f"/ws/{game.code}") as ws:
        ws.send_json({"t": "hello", "session": body["session"]})
        welcome = ws.receive_json()
        assert welcome["t"] == "welcome"
        assert welcome["question"] is None  # nothing to answer yet
        assert welcome["room"]["phase"] == "splash"
        assert welcome["room"]["next_at"] is None  # nobody has tapped ready yet
        assert welcome["room"]["segment"]["mode"] == "more_less"
        assert welcome["room"]["segment"]["index"] == 0


def test_end_game_during_a_splash_voids_nothing(table, db) -> None:
    game = table("Zezima", seconds=10, splash=True)
    game.start()
    game.splash()
    game.admin.send(t="end_game")
    game.admin.take("game_finished")
    assert game.room.status == "finished"
    assert game.room.phase == "idle"
    assert not any(row["voided"] for row in db("select voided from questions"))


def test_a_restart_during_a_splash_replays_it(table, client, db, evict) -> None:
    """A splash is a question that has not opened, which recovery already handles."""
    game = table("Zezima", seconds=10, reveal_seconds=1, splash=True)
    game.start()
    for seat in game.seats:  # every socket, so none has a frame left to read at the close
        game.splash(seat)
    assert evict(game.code) is True
    for seat in game.seats:
        assert closed_with(seat.ws) == 1012

    with client.websocket_connect(f"/ws/{game.code}") as ws:
        admin = reseat(game.admin, ws)
        assert admin.take("welcome")["room"]["phase"] == "reveal"
        room = game.room
        assert room.current_index == 0
        assert room.questions[0].shown_at is None
        assert not any(question.voided for question in room.questions)
        # The reveal ends, and the round is introduced again before the question it owes.
        assert game.splash(admin)["room"]["phase"] == "splash"
        admin.send(t="ready", ready=True)  # the only one connected: a room of one
        assert admin.take("question_open")["question"]["index"] == 0


def test_a_room_whose_mode_left_the_registry_still_resumes_and_plays(
    second_mode, table, client, db, evict
) -> None:
    """A stored room outlives its round's mode, and settings keys a newer build wrote:
    each of its questions carries its own type, and that is all the game loop reads."""
    game = table(
        "Zezima",
        seconds=10,
        modes=[{"mode": second_mode, "questions": 3}],
        reveal_seconds=1,
    )
    game.start()
    game.opened(0)
    assert evict(game.code) is True
    for seat in game.seats:
        assert closed_with(seat.ws) == 1012
    db(
        "update rooms set settings = jsonb_set("
        """settings || '{"list_publicly": true}', '{modes,0,hidden}', 'true')"""
    )
    removed = MODES.pop(second_mode)
    try:
        with client.websocket_connect(f"/ws/{game.code}") as ws:
            again = reseat(game.players[0], ws)
            assert again.take("welcome")["room"]["segment"]["mode"] == second_mode
            opened = again.take("question_open")["question"]
            assert (opened["index"], opened["mode"], opened["type"]) == (
                1,
                second_mode,
                "more_less",
            )
            assert (at(opened, "ends_at") - at(opened, "answerable_at")).total_seconds() == 10
    finally:
        MODES[second_mode] = removed


def test_a_lookup_does_not_resume_a_restarted_room(table, client, db, evict) -> None:
    """Only a player coming back resumes a room, so a scanner or a link preview asking
    for the code never plays the game on to nobody."""
    game = table("Zezima", seconds=10, reveal_seconds=3)
    game.start()
    game.opened(0)
    assert evict(game.code) is True
    for seat in game.seats:
        assert closed_with(seat.ws) == 1012

    assert client.get(f"/api/rooms/{game.code}").json() == {"status": "playing", "players": 2}
    assert join(client, game.code, "Woox").status_code == 409
    with client.websocket_connect(f"/ws/{game.code}") as ws:
        ws.send_json({"t": "hello", "session": "not-a-session"})
        assert ws.receive_json()["code"] == "bad_hello"
        assert closed_with(ws) == 4001

    room = game.room
    assert room.timer is None
    assert room.phase == "idle"
    (stored,) = db("select closed_at, voided from questions where position = 0")
    assert (stored["closed_at"], stored["voided"]) == (None, False)

    with client.websocket_connect(f"/ws/{game.code}") as ws:
        admin = reseat(game.admin, ws)
        assert admin.take("welcome")["room"]["phase"] == "reveal"
        assert game.room.timer is not None
    assert db("select voided from questions where position = 0")[0]["voided"] is True


def test_a_recovery_that_fails_is_tried_again_by_the_next_player(
    table, client, db, evict, faults
) -> None:
    """A room left in memory unrecovered would never be offered to recovery again."""
    game = table("Zezima", seconds=10, reveal_seconds=30)
    game.start()
    game.opened(0)
    assert evict(game.code) is True
    for seat in game.seats:
        assert closed_with(seat.ws) == 1012

    faults.fail_once("update questions set closed_at")
    with pytest.raises(ConnectionResetError), client.websocket_connect(f"/ws/{game.code}") as ws:
        reseat(game.admin, ws).take("welcome")
    assert game.code not in game.app.state.rooms.rooms

    with client.websocket_connect(f"/ws/{game.code}") as ws:
        admin = reseat(game.admin, ws)
        assert admin.take("welcome")["room"]["phase"] == "reveal"
    assert db("select voided from questions where position = 0")[0]["voided"] is True


def test_nobody_new_joins_a_game_under_way(game, client) -> None:
    """Too late is too late; a player already in comes back on their own session."""
    game.start()
    game.opened(0)
    response = join(client, game.code, "Lynx")
    assert response.status_code == 409
    assert response.json()["code"] == "not_open"
    with client.websocket_connect(f"/ws/{game.code}") as ws:
        again = reseat(game.players[0], ws)
        assert again.take("welcome")["question"]["index"] == 0


# --- the ready check ----------------------------------------------------------------


def test_ready_in_the_lobby_is_broadcast_by_name(table, clock) -> None:
    """The lobby list: who is ready is everyone's to see, and a tap can be taken back."""
    game = table("Zezima", "Woox")
    message = tap(game, game.players[0])
    assert ready_of(message) == {game.admin.name: False, "Zezima": True, "Woox": False}
    assert game.room.status == "lobby"
    clock[0] += CHANGE_COOLDOWN
    assert not ready_of(tap(game, game.players[0], False))["Zezima"]


def test_ready_is_refused_while_a_question_is_open(game) -> None:
    game.start()
    game.opened(0)
    game.players[0].send(t="ready", ready=True)
    assert game.players[0].take("error")["code"] == "bad_state"


def test_ready_must_be_a_boolean(game) -> None:
    game.players[0].send(t="ready", ready="yes")
    assert game.players[0].take("error")["code"] == "bad_message"


def test_every_splash_starts_nobody_ready(table) -> None:
    """Ready to start is not ready for the round: the splash asks again."""
    game = table("Zezima", seconds=10, splash=True)
    for seat in game.seats:
        seat.send(t="ready", ready=True)
    updated(game.admin, lambda m: all(ready_of(m).values()))
    game.start()
    assert not any(ready_of(game.splash()).values())


def test_a_splash_has_no_clock_of_its_own(table) -> None:
    """Nobody ready, nothing running: the splash waits well past its old eight seconds."""
    game = table("Zezima", seconds=10, splash=True)
    game.start()
    assert game.splash()["room"]["next_at"] is None
    time.sleep(1.5)
    room = game.room
    assert (room.phase, room.next_at) == ("splash", None)
    game.skip()  # the host's override still works on a waiting splash
    assert game.admin.take("question_open")["question"]["index"] == 0


def test_a_room_of_one_waits_for_its_player(table) -> None:
    """Exempt from the cap: the threshold is 1, and that one tap is everyone: 3 seconds."""
    game = table(seconds=10, splash=True)
    game.start()
    game.splash()
    hurried = tap(game, game.admin)
    assert 0 < seconds_left(hurried) <= EVERYONE_READY_SECONDS
    started = time.monotonic()
    assert game.admin.take("question_open")["question"]["index"] == 0
    assert time.monotonic() - started < THRESHOLD_SECONDS  # the short count, not the long


def test_the_threshold_starts_ten_seconds_and_everyone_brings_it_to_three(table) -> None:
    """A room of three with one in the kitchen: two taps start it, the third shortens it."""
    game = table("Zezima", "Woox", seconds=10, splash=True)
    game.start()
    game.splash()
    # One of three is short: only the players changed, so the room is not in the frame.
    assert tap(game, game.admin)["t"] == "players_updated"
    assert game.room.next_at is None
    two = tap(game, game.players[0])
    assert EVERYONE_READY_SECONDS < seconds_left(two) <= THRESHOLD_SECONDS
    three = tap(game, game.players[1])
    assert 0 < seconds_left(three) <= EVERYONE_READY_SECONDS
    started = time.monotonic()
    game.admin.take("question_open")
    assert time.monotonic() - started < THRESHOLD_SECONDS


def test_the_host_can_skip_a_counting_splash(table) -> None:
    game = table("Zezima", "Woox", seconds=10, splash=True)
    game.start()
    game.splash()
    tap(game, game.admin)
    tap(game, game.players[0])
    assert game.room.phase == "splash"
    game.skip()
    assert game.admin.take("question_open")["question"]["index"] == 0


def test_an_un_ready_below_the_threshold_stops_the_countdown(table) -> None:
    game = table("Zezima", "Woox", seconds=10, splash=True)
    game.start()
    game.splash()
    tap(game, game.admin)
    assert tap(game, game.players[0])["room"]["next_at"] is not None
    stopped = tap(game, game.players[0], False)
    assert stopped["room"]["next_at"] is None
    assert game.room.phase == "splash"
    again = tap(game, game.players[0])  # and tapping again starts it afresh
    assert EVERYONE_READY_SECONDS < seconds_left(again) <= THRESHOLD_SECONDS


def test_a_splash_allows_one_un_ready_each(table) -> None:
    """Spam-proofing: the second take-back on a splash is refused and changes nothing."""
    game = table("Zezima", "Woox", seconds=10, splash=True)
    game.start()
    game.splash()
    tap(game, game.admin)
    player = game.players[0]
    tap(game, player)
    assert tap(game, player, False)["room"]["next_at"] is None  # the one take-back
    counting = tap(game, player)
    player.send(t="ready", ready=False)
    assert player.take("error")["code"] == "bad_state"
    room = game.room
    assert room.players[UUID(player.id)].ready is True
    assert room.next_at == datetime.fromisoformat(counting["room"]["next_at"])


def test_the_lobby_toggle_has_no_count_limit_only_a_cooldown(table, clock) -> None:
    game = table("Zezima")
    for _ in range(3):
        tap(game, game.players[0])
        clock[0] += CHANGE_COOLDOWN
        tap(game, game.players[0], False)
        clock[0] += CHANGE_COOLDOWN


def test_an_un_ready_that_keeps_the_threshold_keeps_the_countdown(table) -> None:
    """Five players: everyone ready is three seconds, one taking it back is four of five
    -- still the threshold -- and the countdown already running is not pushed back."""
    game = table("Zezima", "Woox", "Lynx", "Hey Jase", seconds=10, splash=True)
    game.start()
    game.splash()
    for seat in game.seats[:-1]:
        tap(game, seat)
    everyone = tap(game, game.seats[-1])
    assert 0 < seconds_left(everyone) <= EVERYONE_READY_SECONDS
    back = tap(game, game.seats[-1], False)
    assert back["t"] == "players_updated"  # the room, countdown and all, did not move
    assert game.room.view().model_dump(mode="json")["next_at"] == everyone["room"]["next_at"]


def test_a_disconnect_lowers_the_threshold_rather_than_stalling(table) -> None:
    """One of three is short; the third leaving makes it one of two, which is enough."""
    game = table("Zezima", "Woox", seconds=10, splash=True)
    game.start()
    game.splash()
    assert tap(game, game.admin)["t"] == "players_updated"
    assert game.room.next_at is None
    game.players[1].ws.close()

    def woox_gone(message: dict[str, Any]) -> bool:
        return not {p["display_name"]: p["connected"] for p in message["players"]}["Woox"]

    left = seconds_left(updated(game.admin, woox_gone))
    assert EVERYONE_READY_SECONDS < left <= THRESHOLD_SECONDS


def test_a_kick_mid_splash_lowers_the_threshold_like_a_disconnect(table) -> None:
    game = table("Zezima", "Woox", seconds=10, splash=True)
    game.start()
    game.splash()
    assert tap(game, game.admin)["t"] == "players_updated"
    woox = game.players[1]
    game.admin.send(t="kick", player_id=woox.id)
    assert closed_after(woox) == 4003
    update = game.admin.take("room_updated")
    assert update["room"]["phase"] == "splash"
    assert [p["display_name"] for p in update["players"]] == ["Admin", "Zezima"]
    assert EVERYONE_READY_SECONDS < seconds_left(update) <= THRESHOLD_SECONDS


def test_a_connect_never_stops_a_countdown(table, client) -> None:
    """A phone waking up changes the threshold; it must not reset a running countdown."""
    game = table("Zezima", seconds=10, splash=True)
    body = join(client, game.code, "Latecomer").json()  # in the lobby, connecting later
    game.start()
    game.splash()
    counting = tap(game, game.players[0])  # one of two is the threshold
    assert counting["room"]["next_at"] is not None
    with client.websocket_connect(f"/ws/{game.code}") as ws:
        ws.send_json({"t": "hello", "session": body["session"]})
        welcome = ws.receive_json()
        # One of three is short of the threshold now, and the countdown still runs.
        assert welcome["room"]["next_at"] == counting["room"]["next_at"]


def test_a_player_connecting_mid_splash_sees_who_is_ready(table, client) -> None:
    game = table("Zezima", "Woox", seconds=10, splash=True)
    body = join(client, game.code, "Latecomer").json()  # in the lobby, connecting later
    game.start()
    game.splash()
    tap(game, game.admin)
    with client.websocket_connect(f"/ws/{game.code}") as ws:
        ws.send_json({"t": "hello", "session": body["session"]})
        welcome = ws.receive_json()
        assert welcome["room"]["phase"] == "splash"
        assert ready_of(welcome) == {
            game.admin.name: True,
            "Zezima": False,
            "Woox": False,
            "Latecomer": False,
        }
        assert welcome["you"]["ready"] is False


# --- how long a question and its reveal last -----------------------------------------


def test_a_question_and_its_reveal_last_what_its_type_says_at_the_rooms_pace(table) -> None:
    """``more_less`` is ten seconds open and five revealed at ``run``; ``walk`` adds a
    quarter, rounded to whole seconds. Without names, which hold every reveal a second more."""
    game = table("Zezima", seconds=None, reveal_seconds=None, pace="walk", name_wrong_answers=False)
    game.start()
    view = game.opened(0)[0]["question"]
    assert (at(view, "ends_at") - at(view, "opened_at")).total_seconds() == 13
    assert game.question(0).seconds == 13
    game.skip()
    closed = game.admin.take("question_closed")
    assert closed["reveal_seconds"] == 6
    assert game.room.reveal_seconds == 6
    assert game.room.view().reveal_seconds == 6


def test_an_ordering_question_gets_five_seconds_an_entry_and_two_to_reveal_each(table) -> None:
    game = table(
        "Zezima",
        seconds=None,
        reveal_seconds=None,
        modes=["sort_it_out"],
        name_wrong_answers=False,
    )
    entries = len(game.question(0).payload["entries"])
    game.start()
    view = game.opened(0)[0]["question"]
    assert (at(view, "ends_at") - at(view, "opened_at")).total_seconds() == 10 + 5 * entries
    game.skip()
    assert game.admin.take("question_closed")["reveal_seconds"] == 4 + 2 * entries


def test_the_room_says_how_long_a_reveal_lasts_only_during_one(table) -> None:
    game = table("Zezima", reveal_seconds=30)
    game.start()
    game.opened(0)
    assert game.room.view().reveal_seconds is None
    game.skip()
    game.admin.take("question_closed")
    assert game.room.view().reveal_seconds == 30


def test_a_mode_set_quicker_stays_quick(table) -> None:
    game = table("Zezima", seconds=5)
    game.start()
    view = game.opened(0)[0]["question"]
    opened_at = datetime.fromisoformat(view["opened_at"])
    ends_at = datetime.fromisoformat(view["ends_at"])
    assert (ends_at - opened_at).total_seconds() == 5


def test_speed_buckets_scale_to_the_questions_own_length(game) -> None:
    """A ten-second question buckets on ten seconds, not on the length of a slower round."""
    game.start()
    game.opened(0)
    player = game.players[0]
    # 17.5% of ten seconds is bucket 2; of thirty it would be bucket 1.
    assert answer_after(game, player, 0, game.right(0), AFTER[2])["band"] == 2


# --- credit changed how points are computed, not what a game is worth -----------------


# Question, player, right or wrong, bucket. Lynx and Zezima finish level on points and
# Lynx has one more right answer; Dorn never answers and ties the admin on nothing.
PLAYED = [
    (0, "Zezima", True, 1),
    (0, "Woox", True, 2),
    (0, "Lynx", True, 5),
    (1, "Zezima", False, 1),
    (1, "Woox", False, 3),
    (1, "Lynx", True, 5),
    (2, "Zezima", True, 3),
    (2, "Woox", True, 4),
    (2, "Lynx", True, 5),
]


def test_a_game_of_more_less_scores_what_it_always_scored(table, db) -> None:
    """Credit replaced ``correct`` inside grading, and a ``more_less`` game
    comes out exactly as it did before, to the point and to the rank.

    The numbers are written out, not worked out: a test that recomputed them with the
    formula would agree with any formula at all. They are what this game scored on the
    ``points_for(correct, bucket)`` that credit replaced.
    """
    game = table("Zezima", "Woox", "Lynx", "Dorn", seconds=10, close_when_all_answered=False)
    seat = {s.name: s for s in game.seats}
    game.start()
    results = []
    for index in range(3):
        game.opened(index)
        for _, name, right, bucket in (p for p in PLAYED if p[0] == index):
            value = game.right(index) if right else game.wrong(index)
            answer_after(game, seat[name], index, value, AFTER[bucket])
        game.skip()
        closed = game.admin.take("question_closed")
        results.append({seat_id: row["points"] for seat_id, row in closed["results"].items()})
        assert_memory_matches_db(game, db)

    by_name = {s.id: s.name for s in game.seats}
    assert [{by_name[pid]: points for pid, points in r.items()} for r in results] == [
        {"Zezima": 1000, "Woox": 900, "Lynx": 600},
        {"Zezima": 0, "Woox": 0, "Lynx": 600},
        {"Zezima": 800, "Woox": 700, "Lynx": 600},
    ]
    finished = game.admin.take("game_finished")
    assert [(by_name[s["player_id"]], s["points"], s["rank"]) for s in finished["standings"]] == [
        ("Lynx", 1800, 1),
        ("Zezima", 1800, 2),
        ("Woox", 1600, 3),
        ("Admin", 0, 4),
        ("Dorn", 0, 4),
    ]
    rows = db(
        "select p.display_name, count(*) filter (where a.correct)::int as correct"
        " from answers a join players p on p.id = a.player_id group by p.display_name"
    )
    assert {row["display_name"]: row["correct"] for row in rows} == {
        "Zezima": 2,
        "Woox": 2,
        "Lynx": 3,
    }


def points_by_name(game: Game, closed: dict[str, Any]) -> dict[str, int]:
    by_name = {s.id: s.name for s in game.seats}
    return {by_name[pid]: row["points"] for pid, row in closed["results"].items()}


def test_a_type_scored_on_accuracy_pays_the_same_early_or_late(table, monkeypatch) -> None:
    """``SCORING = ACCURACY`` reaches the ack and the close, and the clock does not.

    ``more_less`` wears it here, for an all-or-nothing credit on a question every seat can
    answer right or wrong.
    """
    monkeypatch.setattr(more_less, "SCORING", Scoring.ACCURACY, raising=False)
    game = table("Zezima", "Woox", "Lynx", seconds=20, close_when_all_answered=False)
    zezima, woox, lynx = game.players
    game.start()
    game.opened(0)
    for seat, right, seconds in ((zezima, True, 1), (woox, True, 19), (lynx, False, 1)):
        value = game.right(0) if right else game.wrong(0)
        ack = answer_after(game, seat, 0, value, seconds)
        assert (ack["scoring"], ack["band"]) == ("accuracy", None)
    assert {answer.band for answer in game.question(0).answers.values()} == {None}
    game.skip()
    closed = game.admin.take("question_closed")
    assert points_by_name(game, closed) == {"Zezima": 1000, "Woox": 1000, "Lynx": 0}


def test_pixel_hunt_pays_the_step_the_answer_arrived_on(table, pictures) -> None:
    """Pixel Hunt's 17 build-up steps are a second each of 25, then the whole picture is the
    18th: in the ack as well as the points."""
    game = table(
        "Zezima", "Woox", "Lynx", modes=["pixel_hunt"], seconds=25, close_when_all_answered=False
    )
    zezima, woox, lynx = game.players
    game.start()
    game.opened(0)
    acks = [
        answer_after(game, seat, 0, game.right(0), seconds)
        for seat, seconds in ((zezima, 0.5), (woox, 16.5), (lynx, 20.0))
    ]
    assert [(ack["scoring"], ack["band"]) for ack in acks] == [
        ("step", 1),
        ("step", 17),
        ("step", 18),
    ]
    game.skip()
    closed = game.admin.take("question_closed")
    assert points_by_name(game, closed) == {"Zezima": 1000, "Woox": 435, "Lynx": 400}


def test_partial_credit_scores_without_being_correct(table, db, monkeypatch) -> None:
    """The road a future ``ordering`` type will drive on, driven early.

    No type returns credit between nothing and everything yet, so ``more_less`` is handed
    a ``grade`` that does, and the rest of the close has to carry it: 0.6 in bucket 2 is
    540 points, the reveal says 0.6, and the answer is not ``correct`` -- in the frame,
    in the row, or in the count the standings tie-break reads.
    """
    game = table("Zezima", "Woox", seconds=10, close_when_all_answered=False)
    zezima, woox = game.players
    partial = {UUID(zezima.id): 0.6, UUID(woox.id): 1.0}
    monkeypatch.setattr(
        more_less, "grade", lambda _, subs: {s.player_id: partial[s.player_id] for s in subs}
    )
    game.start()
    game.opened(0)
    answer_after(game, zezima, 0, game.right(0), AFTER[2])
    answer_after(game, woox, 0, game.right(0), AFTER[5])
    game.skip()
    closed = game.admin.take("question_closed")

    right = game.right(0)
    assert closed["results"] == {
        zezima.id: {"value": right, "correct": False, "credit": 0.6, "points": 540},
        woox.id: {"value": right, "correct": True, "credit": 1.0, "points": 600},
    }
    rows = db("select player_id, correct, points from answers")
    assert {(row["player_id"], row["correct"], row["points"]) for row in rows} == {
        (UUID(zezima.id), False, 540),
        (UUID(woox.id), True, 600),
    }
    assert game.room.score(UUID(zezima.id)).correct == 0
    assert game.room.score(UUID(woox.id)).correct == 1
    assert_memory_matches_db(game, db)


def test_bad_credit_is_clamped_at_the_close_and_the_room_plays_on(
    table, db, monkeypatch, caplog
) -> None:
    """A type whose ``grade`` sums to a hair under 1, overshoots or returns NaN voids
    nothing: the close clamps each, logs the two that are bugs, and pays out."""
    game = table("Zezima", "Woox", "Lynx", seconds=10, close_when_all_answered=False)
    zezima, woox, lynx = game.players
    graded = {UUID(zezima.id): sum([0.1] * 10), UUID(woox.id): 1.2, UUID(lynx.id): math.nan}
    monkeypatch.setattr(
        more_less, "grade", lambda _, subs: {s.player_id: graded[s.player_id] for s in subs}
    )
    game.start()
    game.opened(0)
    for seat in (zezima, woox, lynx):
        answer_after(game, seat, 0, game.right(0), AFTER[1])
    game.skip()
    closed = game.admin.take("question_closed")

    results = closed["results"]
    assert (results[zezima.id]["credit"], results[zezima.id]["correct"]) == (1.0, True)
    assert (results[woox.id]["credit"], results[woox.id]["correct"]) == (1.0, True)
    assert (results[lynx.id]["credit"], results[lynx.id]["correct"]) == (0.0, False)
    assert points_by_name(game, closed) == {"Zezima": 1000, "Woox": 1000, "Lynx": 0}
    errors = [r.getMessage() for r in caplog.records if r.levelname == "ERROR"]
    assert len(errors) == 2 and all("more_less" in message for message in errors)
    assert_memory_matches_db(game, db)
    game.skip()
    game.opened(1)


def test_the_canonical_answer_is_what_is_stored_echoed_and_graded(
    game, db, client, monkeypatch
) -> None:
    """``parse_value`` decides the form an answer lives in from the moment it arrives:
    the row, the reconnect's ``your_answer``, ``grade`` and the reveal all see that one."""
    spelled = {"first": 0, "second": 1}
    monkeypatch.setattr(more_less, "parse_value", lambda _, value: spelled.get(value))
    seen: list[Any] = []
    real_grade = more_less.grade

    def grade(payload: dict[str, Any], subs: list[Any]) -> dict[UUID, float]:
        seen.extend(s.value for s in subs)
        return real_grade(payload, subs)

    monkeypatch.setattr(more_less, "grade", grade)
    game.start()
    game.opened(0)
    player = game.players[0]
    word = "first" if game.right(0) == 0 else "second"
    game.answer(player, 0, word)
    player.take("answer_ack")

    [row] = db("select value from answers")
    assert row["value"] == game.right(0)
    with client.websocket_connect(f"/ws/{game.code}") as again:
        again.send_json({"t": "hello", "session": player.session})
        welcome = again.receive_json()
        assert welcome["your_answer"] == game.right(0)
        game.skip()
        closed = again.receive_json()
        while closed["t"] != "question_closed":
            closed = again.receive_json()
    assert seen == [game.right(0)]
    assert closed["results"][player.id]["value"] == game.right(0)
    assert closed["results"][player.id]["correct"] is True


# --- every round mode, played through the loop -----------------------------------


def play_right_and_wrong(game: Game, index: int) -> dict[str, Any]:
    """Zezima answers question ``index`` right and Woox wrong; the close, checked."""
    zezima, woox = game.players
    game.answer(zezima, index, game.right(index))
    zezima.take("answer_ack")
    game.answer(woox, index, game.wrong(index))
    woox.take("answer_ack")
    game.skip()
    closed = game.admin.take("question_closed")
    question = game.question(index)
    assert closed["reveal"] == TYPES[question.type].reveal(question.payload)
    zezimas, wooxs = (closed["results"][seat.id] for seat in (zezima, woox))
    assert (zezimas["correct"], zezimas["points"] > 0) == (True, True)
    assert wooxs["correct"] is False
    assert wooxs["points"] == 0
    return closed


# A mode that borrows another's pool has its own test, in ``test_random_events_only.py``.
@pytest.mark.parametrize("mode", [mode.id for mode in round_modes() if mode.pool is None])
def test_a_round_of_every_mode_takes_a_right_and_a_wrong_answer_and_closes(
    table, db, pictures, mode: str
) -> None:
    game = table("Zezima", "Woox", modes=[mode], questions=1, seconds=10)
    game.start()
    opened = game.opened(0)[0]["question"]
    question = game.question(0)
    assert question.mode == opened["mode"] == mode
    assert question.type == opened["type"]
    assert question.type in MODES[mode].types
    play_right_and_wrong(game, 0)
    finished = game.admin.take("game_finished")
    assert finished["standings"][0]["display_name"] == "Zezima"
    assert_memory_matches_db(game, db)


def test_a_game_of_two_real_modes_changes_type_between_rounds(table, db) -> None:
    """Each round's answers are the shape of its own type, in the same game."""
    game = table(
        "Zezima",
        "Woox",
        seconds=10,
        modes=[
            {"mode": "more_less", "questions": 2},
            {"mode": "guess_examine", "questions": 2},
        ],
    )
    game.start()
    assert [q.type for q in game.room.questions] == [
        "more_less",
        "more_less",
        "multiple_choice",
        "multiple_choice",
    ]
    game.start()
    for index in range(4):
        assert game.admin.take("question_open")["question"]["index"] == index
        play_right_and_wrong(game, index)
        game.skip()
    finished = game.admin.take("game_finished")
    points = {s["display_name"]: s["points"] for s in finished["standings"]}
    assert points["Woox"] == 0 < points["Zezima"]
    assert game.room.score(UUID(game.players[0].id)).correct == 4
    assert_memory_matches_db(game, db)


# --- random events, the host's own questions and the NPCs' ---------------------------------

TANZANITE = {
    "type": "multiple_choice",
    "payload": {
        "prompt": "Which boss drops the Tanzanite fang?",
        "options": ["Zulrah", "Vorkath", "Jad"],
        "answer_index": 0,
    },
}


def event_rooms(second_mode: str, questions: int = 3) -> dict[str, Any]:
    """Two rounds of ``questions``, at ``more``: six round questions make one event slot.

    The slot is somewhere in the first five, after a question that is not its round's
    last, so it lands in either round. Tests that care where find it with ``the_event``.
    """
    return {
        "random_event_frequency": "more",
        "seconds": 10,
        "modes": [
            {"mode": "more_less", "questions": questions},
            {"mode": second_mode, "questions": questions},
        ],
    }


def the_event(game: Game) -> RoomQuestion:
    game.start()
    (event,) = [q for q in game.room.questions if q.random_event is not None]
    return event


def assert_inside_its_round(game: Game, event: RoomQuestion) -> None:
    """An event interrupts a round: a question of that round on either side of it."""
    questions = game.room.questions
    assert 0 < event.position < len(questions) - 1
    before, after = questions[event.position - 1], questions[event.position + 1]
    assert before.round == event.round == after.round
    assert before.random_event is None and after.random_event is None


def reach(game: Game, index: int) -> dict[str, dict[str, Any]]:
    """Start, skip every question before ``index``, and return each seat's frame for it."""
    game.start()
    for skipped in range(index):
        assert game.admin.take("question_open")["question"]["index"] == skipped
        game.skip()
        game.admin.take("question_closed")
        game.skip()
    frames = {}
    for seat in game.seats:
        while (question := seat.take("question_open")["question"])["index"] != index:
            pass
        frames[seat.name] = question
    return frames


def test_the_author_of_a_custom_question_answers_and_scores_like_everyone(
    table, second_mode, db
) -> None:
    """The host who wrote it answers it, and is stored, graded and scored as on any question.

    It plays in the middle of the round it interrupts -- its own mode on the question, the
    round's on the segment -- asked by an NPC from the roster.
    """
    game = table("Zezima", "Woox", custom=[TANZANITE], reveal_seconds=1, **event_rooms(second_mode))
    admin, zezima, woox = game.seats
    event = the_event(game)
    assert (event.source, event.mode, event.type) == ("room", "custom", "multiple_choice")
    assert event.author_player_id == UUID(admin.id)
    assert_inside_its_round(game, event)
    assert event.random_event in RANDOM_EVENTS

    frames = reach(game, event.position)
    assert {name: frame["you_can_answer"] for name, frame in frames.items()} == {
        "Admin": True,
        "Zezima": True,
        "Woox": True,
    }
    opened = frames["Zezima"]
    assert (opened["type"], opened["mode"]) == ("multiple_choice", "custom")
    assert opened["random_event"] == event.random_event
    round_mode = "more_less" if event.round == 0 else second_mode
    assert (opened["segment"]["mode"], opened["segment"]["index"]) == (round_mode, event.round)
    assert opened["view"] == multiple_choice.client_view(TANZANITE["payload"])

    game.answer(zezima, event.position, 0)
    game.answer(woox, event.position, 2)
    assert zezima.take("answer_ack")["scoring"] == "speed"
    woox.take("answer_ack")
    assert game.room.phase == "open"  # the author has not answered yet
    game.answer(admin, event.position, 0)
    admin.take("answer_ack")
    closed = admin.take("question_closed")  # everyone has answered: it closes early
    assert set(closed["results"]) == {admin.id, zezima.id, woox.id}
    assert closed["results"][admin.id]["correct"] is True
    assert closed["results"][admin.id]["points"] >= 600
    assert closed["results"][zezima.id]["correct"] is True
    assert closed["results"][zezima.id]["points"] >= 600
    assert closed["results"][woox.id]["points"] == 0
    assert closed["reveal"] == multiple_choice.reveal(TANZANITE["payload"])
    points = {s["display_name"]: s["points"] for s in closed["standings"]}
    assert points["Admin"] >= 600 and points["Zezima"] >= 600
    assert_memory_matches_db(game, db)


def test_a_six_option_question_plays_and_its_sixth_option_can_be_the_answer(
    table, second_mode, db
) -> None:
    """Six options, one per gem, is the most a question offers, and all six are live."""
    # Written so that the seeded shuffle shows the answer sixth.
    six = {
        "type": "multiple_choice",
        "payload": {
            "prompt": "Which of these is a gem?",
            "options": ["Bronze", "Zenyte", "Iron", "Steel", "Mithril", "Adamant"],
            "answer_index": 1,
        },
    }
    game = table("Zezima", "Woox", custom=[six], reveal_seconds=1, **event_rooms(second_mode))
    admin, zezima, woox = game.seats
    event = the_event(game)
    frames = reach(game, event.position)
    shown = frames["Zezima"]["view"]["options"]
    assert sorted(shown) == sorted(six["payload"]["options"]) and shown[5] == "Zenyte"
    game.answer(zezima, event.position, 5)
    game.answer(woox, event.position, 0)
    zezima.take("answer_ack")
    woox.take("answer_ack")
    game.skip()  # the host who wrote it could still answer, so it would run its full time
    results = admin.take("question_closed")["results"]
    assert results[zezima.id]["correct"] is True
    assert results[woox.id]["correct"] is False
    assert_memory_matches_db(game, db)


def test_two_identical_custom_questions_each_take_their_own_answers(table, second_mode, db) -> None:
    """The same words give the same content id, but each is its own row: an answer to the
    first that arrives once the second is open is refused, not counted for the second."""
    game = table(
        "Zezima",
        "Woox",
        custom=[TANZANITE, TANZANITE],
        reveal_seconds=1,
        **event_rooms(second_mode, questions=5),
    )
    admin, zezima, woox = game.seats
    game.start()
    first, second = (q for q in game.room.questions if q.random_event is not None)
    assert first.content_id == second.content_id and first.id != second.id

    reach(game, first.position)
    game.answer(zezima, first.position, 0)
    game.answer(woox, first.position, 2)
    assert zezima.take("answer_ack")["t"] == woox.take("answer_ack")["t"] == "answer_ack"
    game.skip()  # the author could still answer, so it would run its full time
    admin.take("question_closed")
    game.skip()
    for between in range(first.position + 1, second.position):
        assert admin.take("question_open")["question"]["index"] == between
        game.skip()
        admin.take("question_closed")
        game.skip()
    for seat in game.seats:
        while seat.take("question_open")["question"]["index"] != second.position:
            pass

    game.answer(zezima, first.position, 2)
    late = reply(zezima, acked)
    assert (late["t"], late.get("code")) == ("error", "not_open")
    game.answer(zezima, second.position, 2)
    game.answer(woox, second.position, 0)
    assert reply(zezima, acked)["t"] == reply(woox, acked)["t"] == "answer_ack"
    game.skip()
    admin.take("question_closed")
    rows = db("select question_id, player_id, value from answers")
    answered = {(row["question_id"], str(row["player_id"])): row["value"] for row in rows}
    assert answered == {
        (first.id, zezima.id): 0,
        (first.id, woox.id): 2,
        (second.id, zezima.id): 2,
        (second.id, woox.id): 0,
    }


def test_a_host_only_custom_question_scores_nobody_and_still_shows_and_closes(
    table, second_mode, db, monkeypatch
) -> None:
    """``host_only`` is for a question the host reads out and nobody plays.
    It opens for everyone, takes no answer from anyone, and closes on its own clock --
    shortened here to one second, while the round around it keeps ten."""
    game = table(
        "Zezima",
        custom=[{**TANZANITE, "host_only": True}],
        reveal_seconds=1,
        **event_rooms(second_mode),
    )
    monkeypatch.setattr(
        game.app.state.rooms, "_answer_seconds", lambda room, q: 1 if q.random_event else 10
    )
    event = the_event(game)
    assert event.host_only
    frames = reach(game, event.position)
    assert {frame["you_can_answer"] for frame in frames.values()} == {False}
    for seat in game.seats:
        game.answer(seat, event.position, 0)
        assert seat.take("error")["code"] == "excluded"
    closed = game.admin.take("question_closed")
    assert closed["results"] == {}
    assert closed["reveal"]["answer_index"] == 0
    assert db("select count(*) as n from answers")[0]["n"] == 0


def test_closest_number_scores_each_guess_against_the_answer(table, second_mode, db) -> None:
    """Exact pays 1000; inside ``within`` a guess earns 750 just off, falling to 250 at the
    edge; past it nothing, however close it is to the others. A silent player scores 0."""
    number = {
        "type": "closest_number",
        "payload": {
            "prompt": "How many hours did the cape take?",
            "answer": 100,
            "within": 10,
            "unit": "hours",
        },
    }
    game = table(
        "Exact",
        "Near",
        "Edge",
        "Far",
        "Silent",
        custom=[number],
        reveal_seconds=1,
        close_when_all_answered=False,
        **event_rooms(second_mode),
    )
    at = the_event(game).position
    reach(game, at)
    seat = {s.name: s for s in game.seats}
    for name, guess in (("Exact", 100), ("Near", 95), ("Edge", 110.0), ("Far", 111)):
        game.answer(seat[name], at, guess)
        ack = seat[name].take("answer_ack")
        assert (ack["scoring"], ack["band"]) == ("accuracy", None)
    game.skip()
    closed = game.admin.take("question_closed")
    by_id = {s.id: s.name for s in game.seats}
    assert {by_id[pid]: row["points"] for pid, row in closed["results"].items()} == {
        "Exact": 1000,
        "Near": 500,
        "Edge": 250,
        "Far": 0,
    }
    assert [by_id[pid] for pid, row in closed["results"].items() if row["correct"]] == ["Exact"]
    points = {s["display_name"]: s["points"] for s in closed["standings"]}
    assert points["Silent"] == 0 and points["Admin"] == 0
    assert_memory_matches_db(game, db)


def test_no_splash_for_an_event_or_for_the_question_after_it(table, second_mode) -> None:
    """The splash introduces a segment, and an event is inside one.

    Two rounds of five at ``more`` hold two events, and with no host's questions both are
    NPCs asking their own. Every question is played through; only the two rounds' first
    questions are introduced, and each event sits in the round it interrupts.
    """
    game = table("Zezima", splash=True, reveal_seconds=1, **event_rooms(second_mode, 5))
    game.start()
    events = [q for q in game.room.questions if q.random_event is not None]
    assert len(events) == 2
    assert {(q.mode, q.source) for q in events} == {("random_event", "pack")}
    assert sum(s.count for s in game.room.segments) == 12
    assert [s.mode for s in game.room.segments] == ["more_less", second_mode]
    for event in events:
        assert_inside_its_round(game, event)

    game.start()
    introduced = []
    for index in range(12):
        question, splashed = next_open(game.admin)
        assert question["index"] == index
        if splashed:
            introduced.append(index)
        game.skip()
        game.admin.take("question_closed")
        game.skip()
    game.admin.take("game_finished")
    assert introduced == [segment.start for segment in game.room.segments]
    for event in events:
        assert event.position not in introduced
        assert event.position + 1 not in introduced


def next_open(seat: Seat) -> tuple[dict[str, Any], bool]:
    """The next ``question_open``, and whether a splash came first.

    Any splash is skipped as it arrives, wanted or not, so a splash in the wrong place is
    an assertion about where it was rather than a test waiting on a ready check forever.
    """
    splashed = False
    for _ in range(30):
        message = seat.ws.receive_json()
        seat.seen.append(message)
        if message["t"] == "room_updated" and message["room"]["phase"] == "splash":
            splashed = True
            seat.skip("splash", message["room"]["current_index"])
        elif message["t"] == "question_open":
            return message["question"], splashed
    raise AssertionError(f"{seat.name} never got question_open; saw {seat.kinds}")


# --- the NPC holds the floor before the buttons appear --------------------------------------


def test_an_ordinary_question_holds_while_its_scroll_types(game, monkeypatch) -> None:
    """The clock starts once the scroll has typed the question in, and runs its full
    seconds from there."""
    monkeypatch.setattr(loop, "question_hold", question_hold)
    game.start()
    (opened, *_) = game.opened(0)
    question = opened["question"]
    assert question["random_event"] is None
    held = (at(question, "answerable_at") - at(question, "opened_at")).total_seconds()
    assert held > 0
    assert held == pytest.approx(question_hold(game.question(0)), abs=0.001)
    assert (at(question, "ends_at") - at(question, "answerable_at")).total_seconds() == 10


def test_an_event_takes_no_answer_before_answerable_at(table, second_mode, db, monkeypatch) -> None:
    """On the server: an answer inside the NPC's hold is ``not_open``, and
    ``ends_at - answerable_at`` is its type's own seconds -- the hold comes on top. The
    hold is the time its intro and question take to type in, which the interlude is timed
    to. The event here is an NPC asking its own question, in the ``random_event`` mode."""
    monkeypatch.setattr(loop, "question_hold", question_hold)
    game = table("Zezima", **event_rooms(second_mode))
    game.app.state.rooms.answer_seconds = None  # the event's own time, not the table's
    event = the_event(game)
    assert (event.mode, event.source) == ("random_event", "pack")
    frames = reach(game, event.position)
    opened = frames["Zezima"]
    assert opened["random_event"] == event.random_event
    held = (at(opened, "answerable_at") - at(opened, "opened_at")).total_seconds()
    assert held == pytest.approx(question_hold(event), abs=0.001)
    seconds = (at(opened, "ends_at") - at(opened, "answerable_at")).total_seconds()
    assert seconds == answer_seconds(event.type, event.payload, "run")

    player = game.players[0]
    assert datetime.now(UTC) < at(opened, "answerable_at"), "reached the event too slowly"
    game.answer(player, event.position, game.right(event.position))
    assert player.take("error")["code"] == "not_open"
    assert not game.question(event.position).answers
    assert db("select count(*) as n from answers")[0]["n"] == 0


def test_answering_the_instant_the_buttons_appear_is_bucket_1(
    table, second_mode, clock, monkeypatch
) -> None:
    """The wait costs nobody a point. Two seconds on a twenty-second question
    would be bucket 2 counted from the open (0.1025 of it); from ``answerable_at`` it is
    the fastest there is."""
    monkeypatch.setattr(loop, "question_hold", lambda question: 2)
    game = table("Zezima", custom=[TANZANITE], **event_rooms(second_mode))
    event = the_event(game)
    reach(game, event.position)
    # Just past the hold on the manager's clock, which is what the band is measured on.
    answerable = game.question(event.position).answerable_mono
    assert answerable == clock[0] + 2
    clock[0] = answerable + 0.05
    zezima = game.players[0]
    game.answer(zezima, event.position, TANZANITE["payload"]["answer_index"])
    assert zezima.take("answer_ack")["band"] == 1
    closed = game.admin.take("question_closed")  # the host wrote it; Zezima is everyone
    assert closed["results"][zezima.id]["points"] == 1000


def test_a_reconnect_inside_the_hold_is_told_how_long_is_left(
    table, second_mode, client, monkeypatch
) -> None:
    """The server's half: ``welcome`` carries the event, its NPC and when the
    buttons appear, against its own ``server_time``, so the client can count the rest of
    the hold down without a message of its own. The client's half is RandomEvent.test.ts.
    """
    monkeypatch.setattr(loop, "question_hold", lambda question: 5)
    game = table("Zezima", **event_rooms(second_mode))
    event = the_event(game)
    frames = reach(game, event.position)
    with client.websocket_connect(f"/ws/{game.code}") as again:
        again.send_json({"t": "hello", "session": game.players[0].session})
        welcome = again.receive_json()
    question = welcome["question"]
    assert question["random_event"] == event.random_event
    assert question["answerable_at"] == frames["Zezima"]["answerable_at"]
    left = (at(question, "answerable_at") - at(welcome, "server_time")).total_seconds()
    assert 0 < left <= 5
    assert welcome["room"]["phase"] == "open"


def test_end_game_inside_the_hold_voids_the_event(table, second_mode, db, monkeypatch) -> None:
    monkeypatch.setattr(loop, "question_hold", lambda question: 5)
    game = table("Zezima", **event_rooms(second_mode))
    event = the_event(game)
    reach(game, event.position)
    game.admin.send(t="end_game")
    game.admin.take("game_finished")
    rows = db("select position, closed_at, voided from questions order by position")
    assert [row["position"] for row in rows if row["voided"]] == [event.position]
    assert rows[event.position]["closed_at"] is not None
    assert (game.room.status, game.room.timer) == ("finished", None)


def test_a_restart_inside_the_hold_voids_the_event_and_resumes_after_it(
    table, second_mode, client, db, evict, monkeypatch
) -> None:
    monkeypatch.setattr(loop, "question_hold", lambda question: 5)
    game = table("Zezima", reveal_seconds=30, **event_rooms(second_mode))
    event = the_event(game)
    reach(game, event.position)
    assert evict(game.code) is True
    for seat in game.seats:
        assert closed_after(seat) == 1012

    with client.websocket_connect(f"/ws/{game.code}") as ws:
        admin = reseat(game.admin, ws)
        welcome = admin.take("welcome")
        assert welcome["question"] is None
        assert (welcome["room"]["phase"], welcome["room"]["current_index"]) == (
            "reveal",
            event.position,
        )
        game.skip(admin)
        assert admin.take("question_open")["question"]["index"] == event.position + 1
    rows = db("select position, voided from questions order by position")
    assert [row["position"] for row in rows if row["voided"]] == [event.position]


def test_no_hold_plays_an_event_as_a_plain_question(table, second_mode) -> None:
    """What the rest of the suite runs on: the NPC is there, and the buttons with it."""
    game = table("Zezima", custom=[TANZANITE], **event_rooms(second_mode))
    event = the_event(game)
    assert loop.question_hold(event) == 0
    frames = reach(game, event.position)
    assert frames["Zezima"]["random_event"] == event.random_event
    assert frames["Zezima"]["answerable_at"] == frames["Zezima"]["opened_at"]
    zezima = game.players[0]
    game.answer(zezima, event.position, 0)
    assert zezima.take("answer_ack")["band"] == 1


# --- the standings, between rounds and only there ------------------------------------


def two_rounds(second_mode: str) -> dict[str, Any]:
    """Two rounds of one ten-second question each, so the first ends in the standings."""
    return {
        "seconds": 10,
        "modes": [
            {"mode": "more_less", "questions": 1},
            {"mode": second_mode, "questions": 1},
        ],
    }


def to_standings(game: Game) -> None:
    """Start, Zezima answers the first round's one question right, and skip on to its standings."""
    zezima = game.players[0]
    game.start()
    game.opened(0)
    game.answer(zezima, 0, game.right(0))
    zezima.take("answer_ack")
    game.skip()
    game.admin.take("question_closed")
    game.skip()
    updated(game.admin, lambda m: m["room"]["phase"] == "standings")


def test_end_game_during_the_standings_finishes_on_them_and_voids_nothing(
    table, db, second_mode
) -> None:
    game = table("Zezima", reveal_seconds=1, standings_seconds=30, **two_rounds(second_mode))
    to_standings(game)
    game.admin.send(t="end_game")
    finished = game.admin.take("game_finished")
    assert [(s["display_name"], s["points"]) for s in finished["standings"]] == [
        ("Zezima", 1000),
        ("Admin", 0),
    ]
    rows = db("select shown_at, voided from questions order by position")
    assert [(row["shown_at"] is not None, row["voided"]) for row in rows] == [
        (True, False),
        (False, False),
    ]
    assert (game.room.status, game.room.timer) == ("finished", None)


def test_a_restart_during_the_standings_resumes_in_the_reveal_and_moves_on(
    table, client, second_mode, evict
) -> None:
    """Section 4: a restart here costs the round its standings and nothing else."""
    game = table("Zezima", reveal_seconds=30, standings_seconds=30, **two_rounds(second_mode))
    to_standings(game)
    assert evict(game.code) is True
    for seat in game.seats:
        assert closed_after(seat) == 1012

    with client.websocket_connect(f"/ws/{game.code}") as ws:
        admin = reseat(game.admin, ws)
        welcome = admin.take("welcome")
        assert (welcome["room"]["phase"], welcome["room"]["current_index"]) == ("reveal", 0)
        assert [s["points"] for s in welcome["standings"]] == [1000, 0]
        game.skip(admin)
        assert admin.take("question_open")["question"]["index"] == 1
        assert standings_updates(admin) == []
    assert not any(question.voided for question in game.room.questions)


def test_a_restart_during_the_last_questions_reveal_finishes_the_game(
    table, client, db, evict
) -> None:
    game = table("Zezima", seconds=10, reveal_seconds=30, questions=1)
    zezima = game.players[0]
    game.start()
    game.opened(0)
    game.answer(zezima, 0, game.right(0))
    zezima.take("answer_ack")
    game.skip()
    assert game.admin.take("question_closed")["next_at"] is not None
    assert evict(game.code) is True
    for seat in game.seats:
        assert closed_after(seat) == 1012

    with client.websocket_connect(f"/ws/{game.code}") as ws:
        admin = reseat(game.admin, ws)
        welcome = admin.take("welcome")
        assert (welcome["room"]["phase"], welcome["room"]["current_index"]) == ("reveal", 0)
        game.skip(admin)
        finished = admin.take("game_finished")
    assert [(s["display_name"], s["points"]) for s in finished["standings"]] == [
        ("Zezima", 1000),
        ("Admin", 0),
    ]
    assert db("select status from rooms")[0]["status"] == "finished"
    assert db("select voided from questions")[0]["voided"] is False


def standings_updates(seat: Seat) -> list[dict[str, Any]]:
    """Every ``room_updated`` ``seat`` has seen that put the room in ``standings``."""
    return [
        message
        for message in seat.seen
        if message["t"] == "room_updated" and message["room"]["phase"] == "standings"
    ]


def play_out(game: Game, count: int) -> dict[str, Any]:
    """Skip through ``count`` questions and whatever sits between them; the final frame.

    A skip during a standings phase ends it, so the loop skips the standings too, which
    is what lets one helper play a game with and without them.
    """
    for index in range(count):
        assert game.admin.take("question_open")["question"]["index"] == index
        game.skip()
        game.admin.take("question_closed")
        game.skip()
        if index + 1 < count and game.room.segment_at(index + 1).start == index + 1:  # type: ignore[union-attr]
            if game.room.settings.standings_seconds > 0:
                updated(game.admin, lambda m: m["room"]["phase"] == "standings")
                game.skip()
    return game.admin.take("game_finished")


def test_standings_end_every_round_but_the_last(table, second_mode) -> None:
    """None between two questions of one round; one after each round but the
    last, lasting ``standings_seconds``; the last round goes straight to ``finished``."""
    game = table(
        "Zezima",
        reveal_seconds=1,
        standings_seconds=10,
        seconds=10,
        modes=[
            {"mode": "more_less", "questions": 2},
            {"mode": second_mode, "questions": 2},
        ],
    )
    game.start()
    game.opened(0)
    game.answer(game.players[0], 0, game.right(0))
    game.players[0].take("answer_ack")
    game.skip()
    closed = game.admin.take("question_closed")
    game.skip()
    game.opened(1)  # the same round: straight on, no standings in between
    assert standings_updates(game.admin) == []

    game.skip()
    game.admin.take("question_closed")
    update = updated(game.admin, lambda m: m["room"]["phase"] == "standings")
    assert game.room.phase == "standings"
    assert update["room"]["current_index"] == 1  # still on the round it closes
    assert update["room"]["segment"]["index"] == 0
    assert 8 < seconds_left(update) <= 10

    game.skip()
    assert game.admin.take("question_open")["question"]["index"] == 2
    game.skip()
    game.admin.take("question_closed")
    game.skip()
    game.admin.take("question_open")
    game.skip()
    game.admin.take("question_closed")
    game.skip()
    finished = game.admin.take("game_finished")
    assert len(standings_updates(game.admin)) == 1  # the last round had none of its own
    assert finished["standings"][0]["points"] == closed["standings"][0]["points"] == 1000


def test_standings_end_on_their_own(table, second_mode) -> None:
    """Nobody skips: the phase holds for ``standings_seconds`` and the next round opens."""
    game = table(
        "Zezima",
        reveal_seconds=1,
        standings_seconds=1,
        seconds=10,
        modes=[
            {"mode": "more_less", "questions": 1},
            {"mode": second_mode, "questions": 1},
        ],
    )
    game.start()
    game.opened(0)
    game.skip()
    game.admin.take("question_closed")
    update = updated(game.admin, lambda m: m["room"]["phase"] == "standings")
    ends_at = datetime.fromisoformat(update["room"]["next_at"])
    opened = game.admin.take("question_open")["question"]
    assert opened["index"] == 1
    assert datetime.fromisoformat(opened["opened_at"]) >= ends_at - timedelta(milliseconds=200)


def test_standings_seconds_zero_runs_the_rounds_straight_on(table, second_mode) -> None:
    game = table(
        "Zezima",
        reveal_seconds=1,
        standings_seconds=0,
        seconds=10,
        modes=[
            {"mode": "more_less", "questions": 1},
            {"mode": second_mode, "questions": 1},
        ],
    )
    game.start()
    play_out(game, 2)
    assert standings_updates(game.admin) == []


def test_a_single_round_game_has_standings_only_at_the_end(table) -> None:
    game = table("Zezima", seconds=10, reveal_seconds=1, standings_seconds=10)
    game.start()
    play_out(game, 3)
    assert standings_updates(game.admin) == []


def test_the_standings_follow_a_round_whose_splash_is_off(table, second_mode) -> None:
    """The splash introduces a mode and can be switched off; the standings follow every
    round whatever the splash does, and the next round's splash comes after them."""
    game = table(
        "Zezima",
        reveal_seconds=1,
        splash=True,
        standings_seconds=10,
        seconds=10,
        modes=[
            {"mode": "more_less", "questions": 1},
            {"mode": second_mode, "questions": 1},
        ],
    )
    game.start()
    game.splash()
    game.skip()
    game.admin.take("question_open")
    game.skip()
    game.admin.take("question_closed")
    game.skip()
    updated(game.admin, lambda m: m["room"]["phase"] == "standings")
    game.skip()
    assert game.splash()["room"]["segment"]["mode"] == second_mode


def test_skip_during_the_reveal_does_not_also_skip_the_standings(table, second_mode) -> None:
    """One skip is one phase: the reveal it cut short does not carry it into the next."""
    game = table(
        "Zezima",
        reveal_seconds=30,
        standings_seconds=30,
        seconds=10,
        modes=[
            {"mode": "more_less", "questions": 1},
            {"mode": second_mode, "questions": 1},
        ],
    )
    game.start()
    game.opened(0)
    game.skip()
    game.admin.take("question_closed")
    game.skip()
    update = updated(game.admin, lambda m: m["room"]["phase"] == "standings")
    assert seconds_left(update) > 25
    time.sleep(0.3)
    assert game.room.phase == "standings"


def test_a_player_arriving_during_the_standings_sees_them(table, client, second_mode) -> None:
    """A first connect or a reconnect during ``standings`` gets the phase, the
    standings and the ``next_at`` a live socket was sent."""
    game = table(
        "Zezima",
        reveal_seconds=1,
        standings_seconds=30,
        seconds=10,
        modes=[
            {"mode": "more_less", "questions": 1},
            {"mode": second_mode, "questions": 1},
        ],
    )
    late = join(client, game.code, "Lynx Titan").json()  # in the lobby, connecting later
    game.start()
    game.opened(0)
    game.answer(game.players[0], 0, game.right(0))
    game.players[0].take("answer_ack")
    game.skip()
    closed = game.admin.take("question_closed")
    update = updated(game.admin, lambda m: m["room"]["phase"] == "standings")

    for session in (game.players[0].session, late["session"]):
        with client.websocket_connect(f"/ws/{game.code}") as again:
            again.send_json({"t": "hello", "session": session})
            welcome = again.receive_json()
            assert welcome["t"] == "welcome"
            assert welcome["room"]["phase"] == "standings"
            assert welcome["room"]["next_at"] == update["room"]["next_at"]
            assert welcome["question"] is None
            ranked = [(s["player_id"], s["points"]) for s in welcome["standings"]]
            assert ranked[: len(closed["standings"])] == [
                (s["player_id"], s["points"]) for s in closed["standings"]
            ]


def test_skip_is_ignored_outside_a_game_and_accepted_in_standings(table, second_mode) -> None:
    """Outside a game no phase is running, so every skip names one that is not."""
    game = table(
        "Zezima",
        reveal_seconds=1,
        standings_seconds=30,
        seconds=10,
        modes=[
            {"mode": "more_less", "questions": 1},
            {"mode": second_mode, "questions": 1},
        ],
    )
    game.admin.skip("open", 0)
    game.admin.settle()
    assert "error" not in game.admin.kinds
    assert (game.room.status, game.room.advance.is_set()) == ("lobby", False)
    game.start()
    game.opened(0)
    game.skip()
    game.admin.take("question_closed")
    updated(game.admin, lambda m: m["room"]["phase"] == "standings")
    started = time.monotonic()
    game.skip()
    assert game.admin.take("question_open")["question"]["index"] == 1
    assert time.monotonic() - started < 1


# --- the timer: a step that fails, a race it loses, a wall clock that jumps ----------


def broken_once(real: Callable[..., Any], broken: Callable[..., Any]) -> Callable[..., Any]:
    """``broken`` on the first call and ``real`` from then on."""
    calls: list[object] = []

    def either(*args: Any) -> Any:
        calls.append(args)
        return (broken if len(calls) == 1 else real)(*args)

    return either


def raising_grade(payload: Any, submissions: Any) -> dict[UUID, float]:
    raise RuntimeError("a bug in grade")


def raising_reveal(payload: Any) -> dict[str, Any]:
    raise RuntimeError("a bug in reveal")


# Credit over 1 is not among them: the close clamps it and plays on
# (``test_bad_credit_is_clamped_at_the_close_and_the_room_plays_on``).
@pytest.mark.parametrize("breakage", ["grade raises", "reveal raises", "database drops"])
def test_a_close_that_fails_voids_the_question_and_the_game_plays_on(
    table, client, db, faults, monkeypatch, breakage: str
) -> None:
    """The room restarts as it would after a crash: the question is voided, everyone
    reconnects into its reveal, and the rest of the game is played and scored."""
    game = table("Zezima", seconds=10, reveal_seconds=1)
    match breakage:
        case "grade raises":
            monkeypatch.setattr(more_less, "grade", broken_once(more_less.grade, raising_grade))
        case "reveal raises":
            monkeypatch.setattr(more_less, "reveal", broken_once(more_less.reveal, raising_reveal))
        case "database drops":
            faults.fail_once("update questions set closed_at = $1 where")
    game.start()
    game.opened(0)
    game.answer(game.players[0], 0, game.right(0))
    game.players[0].take("answer_ack")
    game.skip()

    assert left_memory(game), "the room stayed in memory with its timer stopped"
    assert [closed_after(seat) for seat in game.seats] == [1012, 1012]
    assert "question_closed" not in game.admin.kinds
    (stored,) = db("select closed_at from questions where position = 0")
    assert stored["closed_at"] is None  # nothing of the close was written

    with ExitStack() as stack:
        admin, zezima = [
            reseat(seat, stack.enter_context(client.websocket_connect(f"/ws/{game.code}")))
            for seat in game.seats
        ]
        welcome = zezima.take("welcome")
        assert (welcome["room"]["phase"], welcome["question"]) == ("reveal", None)
        assert zezima.take("question_open")["question"]["index"] == 1
        game.answer(zezima, 1, game.right(1))
        zezima.take("answer_ack")
        game.skip(admin)
        assert admin.take("question_closed")["results"][zezima.id]["points"] == 1000
        game.skip(admin)
        admin.take("question_open")
        game.skip(admin)
        finished = admin.take("game_finished")
    assert [s["points"] for s in finished["standings"]] == [1000, 0]
    assert [row["voided"] for row in db("select voided from questions order by position")] == [
        True,
        False,
        False,
    ]
    (voided,) = db(
        "select a.points from answers a join questions q on q.id = a.question_id"
        " where q.position = 0"
    )
    assert voided["points"] is None
    assert_memory_matches_db(game, db)


def test_a_question_whose_opening_fails_is_still_asked_after_the_restart(
    table, client, db, faults
) -> None:
    """Nothing of the open was written, so the restart owes the question, not a void."""
    game = table("Zezima", seconds=10, reveal_seconds=30)
    game.start()
    game.opened(0)
    faults.fail_once("update questions set shown_at")
    game.skip()
    game.admin.take("question_closed")
    game.skip()  # the reveal ends, and opening question 1 is what fails

    assert left_memory(game), "the room stayed in memory with its timer stopped"
    assert [closed_after(seat) for seat in game.seats] == [1012, 1012]
    with client.websocket_connect(f"/ws/{game.code}") as ws:
        admin = reseat(game.admin, ws)
        assert admin.take("welcome")["room"]["phase"] == "reveal"
        game.skip(admin)
        assert admin.take("question_open")["question"]["index"] == 1
    assert not any(row["voided"] for row in db("select voided from questions"))


def test_a_game_whose_finish_fails_finishes_after_the_restart(table, client, db, faults) -> None:
    game = table("Zezima", seconds=10, reveal_seconds=30, questions=1)
    game.start()
    game.opened(0)
    faults.fail_once("update rooms set status = 'finished'")
    game.skip()
    game.admin.take("question_closed")
    game.skip()  # the reveal ends the game, and finishing it is what fails

    assert left_memory(game), "the room stayed in memory with its timer stopped"
    assert [closed_after(seat) for seat in game.seats] == [1012, 1012]
    assert "game_finished" not in game.admin.kinds
    with client.websocket_connect(f"/ws/{game.code}") as ws:
        admin = reseat(game.admin, ws)
        assert admin.take("welcome")["room"]["status"] == "playing"
        game.skip(admin)
        admin.take("game_finished")
    assert db("select status from rooms")[0]["status"] == "finished"


def test_an_end_game_the_database_refuses_leaves_the_game_running(game, client, db, faults) -> None:
    """Nothing ends in memory that the database did not end, so the host can try again."""
    game.start()
    game.opened(0)
    faults.fail_once("update rooms set status = 'finished'")
    admin = game.room.players[UUID(game.admin.id)]
    with pytest.raises(ConnectionResetError):
        call(client, game.app.state.rooms.end_game, game.code, admin)

    room = game.room
    assert (room.status, room.phase) == ("playing", "open")
    assert room.timer is not None and not room.timer.done()
    assert (room.questions[0].closed_at, room.questions[0].voided) == (None, False)
    (stored,) = db("select closed_at, voided from questions where position = 0")
    assert (stored["closed_at"], stored["voided"]) == (None, False)
    game.admin.send(t="end_game")
    game.admin.take("game_finished")
    assert db("select status from rooms")[0]["status"] == "finished"


def test_a_start_the_database_refuses_leaves_the_room_in_the_lobby(game, client, faults) -> None:
    faults.fail_once("update rooms set status = 'playing'")
    admin = game.room.players[UUID(game.admin.id)]
    with pytest.raises(ConnectionResetError):
        call(client, game.app.state.rooms.start_game, game.code, admin)

    room = game.room
    assert (room.status, room.current_index, room.timer) == ("lobby", None, None)
    game.start()
    game.opened(0)


def test_end_game_ahead_of_a_waiting_close_voids_the_question_and_nothing_follows(
    table, db
) -> None:
    """Both queue on the room lock and the host was first: the timer, woken at ``ends_at``
    and waiting behind them, grades nothing and opens nothing."""
    game = table("Zezima", seconds=1, reveal_seconds=1)
    zezima = game.players[0]
    game.start()
    game.opened(0)
    game.answer(zezima, 0, game.right(0))
    zezima.take("answer_ack")
    with lock_held(game):
        game.admin.send(t="end_game")
        time.sleep(1.5)  # past ``ends_at``, so the close is waiting too
    game.admin.take("game_finished")
    time.sleep(1.5)  # a reveal and more, for a timer that survived to open question 1

    assert "question_closed" not in game.admin.kinds
    rows = db("select shown_at, closed_at, voided from questions order by position")
    assert [(row["closed_at"] is not None, row["voided"]) for row in rows] == [
        (True, True),
        (False, False),
        (False, False),
    ]
    assert rows[1]["shown_at"] is None
    (answer,) = db("select correct, points from answers")
    assert (answer["correct"], answer["points"]) == (None, None)
    room = game.room
    assert (room.status, room.timer) == ("finished", None)


def test_an_eviction_ahead_of_a_waiting_close_leaves_the_question_to_recovery(
    table, client, db
) -> None:
    game = table("Zezima", seconds=1, reveal_seconds=1)
    game.start()
    game.opened(0)
    assert client.portal is not None
    with lock_held(game):
        evicted = client.portal.start_task_soon(game.app.state.rooms.evict, game.code)
        time.sleep(1.5)  # past ``ends_at``, so the close is waiting too
    assert evicted.result(5) is True

    assert [closed_after(seat) for seat in game.seats] == [1012, 1012]
    assert all("question_closed" not in seat.kinds for seat in game.seats)
    (stored,) = db("select closed_at from questions where position = 0")
    assert stored["closed_at"] is None  # still open, for the rehydrate to void


@pytest.mark.parametrize("gone", ["ended", "evicted"])
def test_a_timer_step_for_a_room_it_no_longer_drives_changes_nothing(
    table, client, db, gone: str
) -> None:
    """Every step re-checks the room under the lock, for a timer the cancellation has
    not reached yet."""
    game = table("Zezima", seconds=10, reveal_seconds=1)
    game.start()
    game.opened(0)
    manager = game.app.state.rooms
    room = game.room
    if gone == "ended":
        game.admin.send(t="end_game")
        game.admin.take("game_finished")
    else:
        assert call(client, manager.evict, game.code) is True
    snapshot = (
        "select r.status, r.current_index, q.position, q.shown_at, q.closed_at, q.voided"
        " from questions q join rooms r on r.id = q.room_id order by q.position"
    )
    before = db(snapshot)

    assert call(client, manager._splash, room, 1) is False
    assert call(client, manager._open_question, room, 1) is None
    assert call(client, manager._close_question, room, room.questions[0]) is None
    assert call(client, manager._standings, room, 0) is False
    assert call(client, manager._advance, room, 0) is None
    assert db(snapshot) == before


def test_an_answer_from_ends_at_on_is_not_open_even_while_the_close_is_late(game, clock) -> None:
    """A close held up past ``ends_at`` (a busy loop, a slow database) gives nobody more
    time: the answer is judged on when it arrived."""
    game.start()
    game.opened(0)
    player = game.players[0]
    clock[0] += 10  # the question's full ten seconds, on the manager's clock
    game.answer(player, 0, game.right(0))
    refused = reply(player, acked)
    assert (refused["t"], refused.get("code")) == ("error", "not_open")
    assert game.question(0).answers == {}
    assert game.room.phase == "open"  # the close has not run: the clock refused it


def test_answers_that_arrive_together_are_timed_on_arrival(table, db, faults) -> None:
    """Not on their turn at the room lock, which comes after every write ahead of them."""
    game = table("Zezima", "Woox", seconds=10, close_when_all_answered=False)
    faults.stall("insert into answers", 1.2)  # longer than bucket 1 of ten seconds
    game.start()
    game.opened(0)
    # Read before either answer: once one is writing, reading the room waits on its lock.
    question_id, right = str(game.question(0).id), game.right(0)
    for seat in game.players:
        seat.send(t="answer", question_id=question_id, value=right)
    assert [reply(seat, acked)["band"] for seat in game.players] == [1, 1]
    first, second = (row["received_at"] for row in db("select received_at from answers"))
    assert abs((second - first).total_seconds()) < 0.3


def jumped(hours: float) -> type[datetime]:
    """``datetime`` with its wall clock ``hours`` off, for the room state to read."""

    class Jumped(datetime):
        @classmethod
        def now(cls, tz: Any = None) -> datetime:
            return datetime.now(tz) + timedelta(hours=hours)

    return Jumped


@pytest.mark.parametrize("hours", [-1, 1])
def test_a_wall_clock_jump_moves_neither_the_cutoff_nor_the_band(
    game, clock, monkeypatch, hours: int
) -> None:
    game.start()
    game.opened(0)
    for module in (state, loop):
        monkeypatch.setattr(module, "datetime", jumped(hours))
    clock[0] += AFTER[2]
    game.answer(game.players[0], 0, game.right(0))
    ack = reply(game.players[0], acked)
    assert (ack["t"], ack.get("band")) == ("answer_ack", 2)


def test_a_wall_clock_jump_leaves_a_splash_countdown_where_it_was(table, monkeypatch) -> None:
    game = table("Zezima", "Woox", seconds=10, splash=True)
    game.start()
    game.splash()
    tap(game, game.admin)
    tap(game, game.players[0])  # two of three: ten seconds
    for module in (state, loop):
        monkeypatch.setattr(module, "datetime", jumped(1))
    woox = game.players[1]
    woox.send(t="ready", ready=True)
    everyone = reply(woox, lambda m: m["t"] == "room_updated" and ready_of(m)[woox.name])
    assert everyone["t"] == "room_updated", everyone
    ends_at = datetime.fromisoformat(everyone["room"]["next_at"])
    assert 0 < (ends_at - jumped(1).now(UTC)).total_seconds() <= EVERYONE_READY_SECONDS
    time.sleep(1)
    assert game.room.phase == "splash"
