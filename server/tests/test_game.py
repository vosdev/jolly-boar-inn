"""T9 Accept: with one-second questions and ``reveal_seconds = 1`` a 3-question room
runs to ``finished`` unattended; an answer after the close is ``not_open``; a second
answer is ``already_answered``; all-answered closes early; ``start_game`` from a
non-admin is ``not_admin``; ``skip`` during a question closes within 100 ms.

T10 Accept (the database half; the bucket and standings tables are in test_scoring.py):
grading writes ``correct`` and ``points``, ``question_closed`` carries the per-player
results, the sum held in memory equals ``sum(points)`` from the database after every
close, and ``host_only`` and the author of a room question cannot answer.

T11 Accept: a game is killed mid-question (the room dropped from memory and its timer
cancelled, which is what the next ``get`` sees after a process restart); the question comes
back voided, a reconnecting player's ``welcome`` has ``question = null`` and
``phase = reveal``, and the next question opens ``reveal_seconds`` later.

T17 Accept (the game half; the tables are in test_scoring.py): a ``more_less`` game scores
the same fixed standings it scored before credit existed, and a type's ``SCORING`` reaches
both ``answer_ack`` and the close.

Plus the rest of the section 3 and 4 surface these two tasks own: ``question_open`` (and
what it withholds), ``answer_ack``, auto-advance, ``game_finished``, reconnecting
mid-question, ``skip`` during a reveal, ``end_game``, ``promote`` and ``kick``.

Most tests run with ten-second questions and drive the closes themselves with ``skip``,
so what they assert is the state machine and not the wall clock. The ones that are about
time say so.
"""

import time
from collections.abc import Callable, Iterator
from contextlib import ExitStack
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID, uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from starlette.testclient import WebSocketTestSession
from starlette.websockets import WebSocketDisconnect

from app.questions.types import more_less
from app.questions.types.scoring import Scoring
from app.rooms.state import BadState, Room, RoomQuestion
from tests.rooms_api import call, create_fast, join


@dataclass
class Seat:
    """One player at the table: their session, their socket and what it has received."""

    name: str
    session: str
    player: dict[str, Any]
    ws: WebSocketTestSession
    seen: list[dict[str, Any]] = field(default_factory=list)

    @property
    def id(self) -> str:
        return self.player["id"]

    def send(self, **frame: Any) -> None:
        self.ws.send_json(frame)

    def take(self, kind: str, limit: int = 30) -> dict[str, Any]:
        """The next message of type ``kind``. Anything before it is kept in ``seen``.

        Skipping is deliberate: a ``room_updated`` for somebody else connecting can land
        between any two messages a test cares about, and no client may depend on the
        order of those.
        """
        for _ in range(limit):
            message = self.ws.receive_json()
            self.seen.append(message)
            if message["t"] == kind:
                return message
        raise AssertionError(f"{self.name} never got {kind}; saw {self.kinds}")

    @property
    def kinds(self) -> list[str]:
        return [message["t"] for message in self.seen]


@dataclass
class Game:
    app: FastAPI
    client: TestClient
    code: str
    seats: list[Seat]

    @property
    def admin(self) -> Seat:
        return self.seats[0]

    @property
    def players(self) -> list[Seat]:
        return self.seats[1:]

    @property
    def room(self) -> Room:
        return call(self.client, self.app.state.rooms.get, self.code)

    def question(self, index: int) -> RoomQuestion:
        return self.room.questions[index]

    def right(self, index: int) -> int:
        return self.question(index).payload["answer_index"]

    def wrong(self, index: int) -> int:
        return 1 - self.right(index)

    def start(self) -> None:
        self.admin.send(t="start_game")

    def answer(self, seat: Seat, index: int, value: Any) -> None:
        seat.send(t="answer", question_id=self.question(index).question_id, value=value)

    def splash(self, seat: Seat | None = None) -> dict[str, Any]:
        """The next ``room_updated`` that is a splash.

        ``start_game`` broadcasts its own ``room_updated`` for ``lobby -> playing``, and
        that one is still ``idle``: the timer task has not run a step yet.
        """
        seat = seat or self.admin
        for _ in range(10):
            message = seat.take("room_updated")
            if message["room"]["phase"] == "splash":
                return message
        raise AssertionError(f"{seat.name} never got a splash; saw {seat.kinds}")

    def opened(self, index: int) -> list[dict[str, Any]]:
        """Everyone's ``question_open`` for question ``index``."""
        messages = [seat.take("question_open") for seat in self.seats]
        assert {m["question"]["index"] for m in messages} == {index}
        return messages


@pytest.fixture
def table(app: FastAPI, client: TestClient) -> Iterator[Callable[..., Game]]:
    """``table("Zezima", "Woox", seconds=1)`` → a lobby with everyone connected.

    Seat 0 is always the admin. Sockets close when the test ends, before the app does.
    """
    with ExitStack() as stack:

        def build(*names: str, **settings: Any) -> Game:
            room, admin, session = create_fast(app, client, **settings)
            # The admin comes back from ``create`` itself, in the shape ``join`` returns.
            bodies = [{"session": session, "player": admin.view().model_dump(mode="json")}]
            bodies += [join(client, room.code, name).json() for name in names]
            seats = []
            for body in bodies:
                ws = stack.enter_context(client.websocket_connect(f"/ws/{room.code}"))
                ws.send_json({"t": "hello", "session": body["session"]})
                welcome = ws.receive_json()
                assert welcome["t"] == "welcome", welcome
                seats.append(
                    Seat(body["player"]["display_name"], body["session"], body["player"], ws)
                )
            # Everyone already seated hears each new socket connect. Drain those now so a
            # test that waits for a ``room_updated`` gets the one it is waiting for.
            for index, seat in enumerate(seats):
                for _ in range(len(seats) - 1 - index):
                    message = seat.ws.receive_json()
                    assert message["t"] == "room_updated", message
            return Game(app, client, room.code, seats)

        yield build


@pytest.fixture
def game(table) -> Game:
    """One round of three ten-second questions, an admin and two players, connected."""
    return table("Zezima", "Woox", seconds=10, reveal_seconds=1)


def db_totals(db, code: str) -> dict[UUID, int]:
    """Every player's points straight from the answers table, the way section 5 says."""
    rows = db(
        "select a.player_id, coalesce(sum(a.points), 0)::int as points from answers a"
        " join questions q on q.id = a.question_id join rooms r on r.id = q.room_id"
        " where r.code = $1 group by a.player_id",
        code,
    )
    return {row["player_id"]: row["points"] for row in rows}


def assert_memory_matches_db(game: Game, db) -> None:
    """T10: the sum kept in memory is the one the database holds, after every close.

    A player with no graded answer is 0 either way: absent from ``totals``, or present in
    the query with an ungraded (voided) row that sums to nothing.
    """
    room = game.room
    from_db = db_totals(db, game.code)
    expected = {player_id: from_db.get(player_id, 0) for player_id in room.players}
    assert {player_id: room.score(player_id).points for player_id in room.players} == expected
    assert {s.player_id: s.points for s in room.standings()} == expected
    assert set(room.totals) <= set(from_db)  # memory never invents a scorer


def closed_with(ws: WebSocketTestSession) -> int:
    with pytest.raises(WebSocketDisconnect) as info:
        ws.receive_json()
    return info.value.code


# --- T9: the loop runs itself --------------------------------------------------------


def test_a_three_question_game_runs_to_finished_unattended(table, db) -> None:
    """T9: one-second questions and reveals, three questions, nobody touching anything."""
    game = table("Zezima", "Woox", seconds=1, reveal_seconds=1)
    game.start()
    started = time.monotonic()
    for index in range(3):
        game.opened(index)
        closed = [seat.take("question_closed") for seat in game.seats]
        assert all(message == closed[0] for message in closed)
        last = index == 2
        assert (closed[0]["next_at"] is None) is last, closed[0]
    finals = [seat.take("game_finished") for seat in game.seats]
    assert all(message == finals[0] for message in finals)
    assert [s["points"] for s in finals[0]["standings"]] == [0, 0, 0]  # nobody answered
    assert [s["rank"] for s in finals[0]["standings"]] == [1, 1, 1]

    elapsed = time.monotonic() - started
    assert 3 <= elapsed < 20, f"three 1s questions and reveals took {elapsed:.1f}s"
    room = game.room
    assert room.status == "finished"
    assert room.phase == "idle"
    assert room.timer is None
    assert all(question.closed_at is not None for question in room.questions)
    assert not any(question.voided for question in room.questions)
    assert [row["status"] for row in db("select status from rooms")] == ["finished"]
    assert game.client.get(f"/api/rooms/{game.code}").json()["room"]["status"] == "finished"


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


def test_question_open_is_the_same_frame_for_everyone_and_withholds_the_answer(game) -> None:
    """Section 3: the admin's ``question_open`` is the players', and neither has the answer."""
    game.start()
    opened = game.opened(0)
    assert all(message == opened[0] for message in opened)
    question = game.question(0)
    view = opened[0]["question"]
    assert view["question_id"] == question.question_id
    assert view["type"] == "more_less"
    assert view["total"] == 3
    assert view["you_can_answer"] is True
    assert view["view"] == more_less.client_view(question.payload)
    assert "answer_index" not in view["view"]
    assert all("value" not in option for option in view["view"]["options"])
    for option in question.payload["options"]:
        assert str(option["value"]) not in str(opened[0])
    ends_at = datetime.fromisoformat(view["ends_at"])
    opened_at = datetime.fromisoformat(view["opened_at"])
    # Ten seconds: the ``more_less`` round's own ``seconds``, not a number the room set.
    assert (ends_at - opened_at).total_seconds() == 10
    assert game.room.phase == "open"
    assert game.client.get(f"/api/rooms/{game.code}").json()["room"]["phase"] == "open"


def test_non_admin_cannot_start_the_game(game) -> None:
    """T9: ``start_game`` from a player is ``not_admin``."""
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
    assert info.value.message == "nobody is connected to play"
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


# --- T9: answering -------------------------------------------------------------------


def test_the_answer_row_is_committed_before_the_ack(game, db) -> None:
    """T9/T10: the ack means the row is in Postgres, ungraded until the close."""
    game.start()
    game.opened(0)
    player = game.players[0]
    game.answer(player, 0, game.right(0))
    ack = player.take("answer_ack")
    assert ack == {
        "t": "answer_ack",
        "question_id": game.question(0).question_id,
        "scoring": "speed",
        "band": 1,
    }
    rows = db("select player_id, value, received_at, correct, points from answers")
    assert len(rows) == 1
    assert rows[0]["player_id"] == UUID(player.id)
    assert rows[0]["value"] == game.right(0)
    assert rows[0]["received_at"] is not None
    assert rows[0]["correct"] is None  # grading is the close's job
    assert rows[0]["points"] is None


def test_a_second_answer_is_already_answered(game) -> None:
    """T9: one answer per player per question."""
    game.start()
    game.opened(0)
    player = game.players[0]
    game.answer(player, 0, game.right(0))
    player.take("answer_ack")
    game.answer(player, 0, game.wrong(0))
    assert player.take("error")["code"] == "already_answered"
    assert len(game.question(0).answers) == 1


def test_an_answer_after_the_close_is_not_open(table) -> None:
    """T9: answering a question that has closed is ``not_open``, never scored."""
    game = table("Zezima", seconds=1, reveal_seconds=30)
    game.start()
    game.opened(0)
    player = game.players[0]
    question_id = game.question(0).question_id
    player.take("question_closed")
    player.send(t="answer", question_id=question_id, value=game.right(0))
    assert player.take("error")["code"] == "not_open"
    assert game.question(0).answers == {}


def test_an_answer_for_another_question_is_not_open(game) -> None:
    game.start()
    game.opened(0)
    player = game.players[0]
    player.send(t="answer", question_id=game.question(1).question_id, value=game.right(1))
    assert player.take("error")["code"] == "not_open"


def test_an_answer_that_is_not_a_valid_value_is_bad_value(game) -> None:
    game.start()
    game.opened(0)
    player = game.players[0]
    for value in ("sideways", 3, None, {"higher": True}):
        game.answer(player, 0, value)
        assert player.take("error")["code"] == "bad_value", value
    assert game.question(0).answers == {}


def test_answering_before_the_game_starts_is_not_open(game) -> None:
    player = game.players[0]
    player.send(t="answer", question_id=game.question(0).question_id, value="higher")
    assert player.take("error")["code"] == "not_open"


def test_all_answered_closes_the_question_early(game) -> None:
    """T9: with ``close_when_all_answered`` the question closes when everyone has answered."""
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


def test_a_disconnected_player_does_not_hold_the_close_up(game) -> None:
    """Section 4: the early close waits for the connected players, not the whole roster."""
    game.start()
    game.opened(0)
    absent = game.players[1]
    absent.ws.close()
    update = game.admin.take("room_updated")
    assert [p["connected"] for p in update["players"]] == [True, True, False]
    for seat in (game.admin, game.players[0]):
        game.answer(seat, 0, game.right(0))
        seat.take("answer_ack")
    closed = game.admin.take("question_closed")
    assert set(closed["results"]) == {game.admin.id, game.players[0].id}


def test_an_unanswered_seat_keeps_the_question_open(game) -> None:
    """The early close waits for every connected player who can answer."""
    game.start()
    game.opened(0)
    for seat in game.seats[:2]:
        game.answer(seat, 0, game.right(0))
        seat.take("answer_ack")
    time.sleep(0.2)
    assert game.room.phase == "open"


# --- T9: skip ------------------------------------------------------------------------


def test_skip_closes_the_open_question_within_100ms(game) -> None:
    """T9 Accept: ``skip`` during a question closes it within 100 ms."""
    game.start()
    game.opened(0)
    started = time.monotonic()
    game.admin.send(t="skip")
    closed = game.admin.take("question_closed")
    took = time.monotonic() - started
    assert took < 0.1, f"skip took {took * 1000:.0f} ms"
    assert closed["question_id"] == game.question(0).question_id
    assert game.room.phase == "reveal"


def test_skip_during_the_reveal_opens_the_next_question(table) -> None:
    game = table("Zezima", seconds=10, reveal_seconds=30)
    game.start()
    game.opened(0)
    game.admin.send(t="skip")
    game.admin.take("question_closed")
    started = time.monotonic()
    game.admin.send(t="skip")
    opened = game.admin.take("question_open")
    assert time.monotonic() - started < 1
    assert opened["question"]["index"] == 1


def test_a_player_cannot_skip(game) -> None:
    game.start()
    game.opened(0)
    game.players[0].send(t="skip")
    assert game.players[0].take("error")["code"] == "not_admin"
    assert game.room.phase == "open"


def test_skips_during_a_close_never_deadlock_the_room(table) -> None:
    """Section 4: ``skip`` cancels a sleep, it does not fight the timer for the lock."""
    game = table("Zezima", seconds=1, reveal_seconds=1)
    game.start()
    for _ in range(12):  # land on opens, closes and reveals alike
        game.admin.send(t="skip")
    finished = game.admin.take("game_finished", limit=80)
    assert len(finished["standings"]) == 2
    assert game.room.status == "finished"


# --- T9: reconnecting mid-game -------------------------------------------------------


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
        assert welcome["question"] == opened["question"]
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


# --- T10: grading and standings ------------------------------------------------------


def test_the_close_grades_every_answer_and_reveals_the_results(game, db) -> None:
    """T10: ``correct`` and ``points`` are written at the close and sent with the reveal."""
    game.start()
    game.opened(0)
    right, wrong = game.players
    game.answer(right, 0, game.right(0))
    right.take("answer_ack")
    game.answer(wrong, 0, game.wrong(0))
    wrong.take("answer_ack")
    game.admin.send(t="skip")
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
        {"player_id": right.id, "display_name": right.name, "points": 1000, "rank": 1},
        {"player_id": game.admin.id, "display_name": "Admin", "points": 0, "rank": 2},
        {"player_id": wrong.id, "display_name": wrong.name, "points": 0, "rank": 2},
    ]
    assert all(standing["avatar"] is None for standing in closed["standings"])
    rows = db("select player_id, correct, points from answers order by points desc")
    assert [(row["player_id"], row["correct"], row["points"]) for row in rows] == [
        (UUID(right.id), True, 1000),
        (UUID(wrong.id), False, 0),
    ]
    assert_memory_matches_db(game, db)


def test_the_sum_in_memory_matches_the_database_after_every_close(game, db) -> None:
    """T10 Accept: after each close, the in-memory total is ``sum(points)`` from the table."""
    game.start()
    for index in range(3):
        game.opened(index)
        # A different pattern each question, so the running totals actually diverge.
        for offset, seat in enumerate(game.seats):
            if (index + offset) % 3:
                game.answer(seat, index, game.right(index) if offset else game.wrong(index))
                seat.take("answer_ack")
        game.admin.send(t="skip")
        closed = game.admin.take("question_closed")
        assert_memory_matches_db(game, db)
        assert closed["standings"] == [
            standing.model_dump(mode="json") for standing in game.room.standings()
        ]
    finished = game.admin.take("game_finished")
    assert finished["standings"] == closed["standings"]
    assert sum(s["points"] for s in finished["standings"]) == sum(db_totals(db, game.code).values())
    assert any(s["points"] > 0 for s in finished["standings"])


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
    game.admin.send(t="skip")
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


# --- T10: exclusions -----------------------------------------------------------------


@pytest.mark.parametrize(
    ("host_only", "source", "is_author", "expected"),
    [
        (False, "pack", False, True),
        (True, "pack", False, False),  # host_only: nobody scores
        (True, "room", True, False),
        (False, "room", False, True),
        (False, "room", True, False),  # the author of a room question
        (False, "community", True, True),  # only source: room excludes an author
    ],
)
def test_can_answer(host_only: bool, source: str, is_author: bool, expected: bool) -> None:
    """Section 6's exclusions, on their own."""
    player_id = uuid4()
    question = RoomQuestion(
        id=uuid4(),
        position=0,
        question_id="q_x",
        type="more_less",
        mode="more_less",
        source=source,
        payload={},
        host_only=host_only,
        author_player_id=player_id if is_author else uuid4(),
    )
    assert question.can_answer(player_id) is expected


def test_a_host_only_question_cannot_be_answered_by_anyone(game, db) -> None:
    """T10: ``host_only`` scores nobody, and the question still shows and closes normally."""
    game.room.questions[0].host_only = True  # what the Phase 2 editor will store
    game.start()
    opened = game.opened(0)
    assert all(message["question"]["you_can_answer"] is False for message in opened)
    for seat in game.seats:
        game.answer(seat, 0, game.right(0))
        assert seat.take("error")["code"] == "excluded"
    assert game.room.phase == "open"  # nobody can answer, so it never closes early
    game.admin.send(t="skip")
    closed = game.admin.take("question_closed")
    assert closed["results"] == {}
    assert closed["reveal"] == more_less.reveal(game.question(0).payload)
    assert db("select * from answers") == []
    assert_memory_matches_db(game, db)


def test_the_author_of_a_room_question_cannot_answer_it(game) -> None:
    """T10: the author exclusion. Phase 2 sets ``author_player_id``; T9 honours it now."""
    author, other = game.players
    question = game.room.questions[0]
    question.source = "room"
    question.author_player_id = UUID(author.id)
    game.start()
    opened = {seat.name: seat.take("question_open") for seat in game.seats}
    assert opened[author.name]["question"]["you_can_answer"] is False
    assert opened[other.name]["question"]["you_can_answer"] is True
    assert opened["Admin"]["question"]["you_can_answer"] is True

    game.answer(author, 0, game.right(0))
    assert author.take("error")["code"] == "excluded"
    # The excluded author does not hold the early close up either.
    for seat in (other, game.admin):
        game.answer(seat, 0, game.right(0))
        seat.take("answer_ack")
    closed = game.admin.take("question_closed")
    assert set(closed["results"]) == {other.id, game.admin.id}
    assert [(s["display_name"], s["points"], s["rank"]) for s in closed["standings"]] == [
        ("Admin", 1000, 1),  # the tie is ordered by join time, and shares the rank
        (other.name, 1000, 1),
        (author.name, 0, 2),
    ]


# --- T9: promote and kick ------------------------------------------------------------


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


# --- D4: set_profile mid-game ---------------------------------------------------------


def test_a_rename_mid_game_disturbs_neither_the_standings_nor_an_open_answer(game, db) -> None:
    """D4 Accept: a rename mid-game does not disturb standings or an open answer."""
    game.start()
    game.opened(0)
    player, other = game.players
    game.answer(player, 0, game.right(0))
    player.take("answer_ack")

    player.send(t="set_profile", display_name="RenamedMidGame", avatar=7)
    update = other.take("room_updated")
    assert update["room"]["phase"] == "open"  # the question is still up
    renamed = next(p for p in update["players"] if p["id"] == player.id)
    assert (renamed["display_name"], renamed["avatar"]) == ("RenamedMidGame", 7)
    # The answer given under the old name is still this player's, and still counts.
    assert game.question(0).answers[UUID(player.id)].value == game.right(0)
    player.send(t="answer", question_id=game.question(0).question_id, value=game.right(0))
    assert player.take("error")["code"] == "already_answered"

    game.admin.send(t="skip")
    closed = other.take("question_closed")
    assert closed["results"][player.id]["points"] == 1000
    top = closed["standings"][0]
    assert (top["player_id"], top["display_name"], top["avatar"], top["points"]) == (
        player.id,
        "RenamedMidGame",
        7,
        1000,
    )
    assert_memory_matches_db(game, db)


# --- T11: restart recovery -----------------------------------------------------------


def reseat(seat: Seat, ws: WebSocketTestSession) -> Seat:
    """The same player on a new socket, the way their client reconnects after a restart."""
    again = Seat(seat.name, seat.session, seat.player, ws)
    again.send(t="hello", session=again.session)
    return again


def test_a_restart_mid_question_voids_it_and_resumes_in_reveal(table, client, db, evict) -> None:
    """T11 Accept: the process dies with a question open.

    ``evict`` is the crash: the room leaves memory and its timer task is cancelled, so the
    next ``get`` rehydrates from Postgres exactly as a fresh process would.
    """
    game = table("Zezima", seconds=10, reveal_seconds=3)
    game.start()
    game.opened(0)
    player = game.players[0]
    game.answer(player, 0, game.right(0))
    player.take("answer_ack")
    question_id = game.question(0).question_id

    assert evict(game.code) is True
    for seat in game.seats:
        assert closed_with(seat.ws) == 1012

    before = datetime.now(UTC)
    room = game.room  # the rehydrate, and with it the recovery
    assert room.questions[0].voided is True
    assert room.questions[0].closed_at is not None
    assert room.phase == "reveal"
    assert room.current_index == 0  # still the voided question's; the reveal is its
    assert room.timer is not None
    # A whole fresh reveal, measured from the restart rather than from the old open. Held
    # in a local: ``room`` is the live object, and opening the next question clears it.
    next_at = room.next_at
    assert next_at is not None
    reveal = (next_at - before).total_seconds()
    assert room.settings.reveal_seconds <= reveal < room.settings.reveal_seconds + 2

    with client.websocket_connect(f"/ws/{game.code}") as ws:
        again = reseat(player, ws)
        welcome = again.take("welcome")
        assert welcome["question"] is None  # nothing is open, so nothing to answer
        assert welcome["your_answer"] is None
        assert welcome["room"]["phase"] == "reveal"
        assert welcome["room"]["status"] == "playing"
        assert welcome["room"]["current_index"] == 0
        # The reveal a reconnect arrives into has no ``question_closed`` to carry its
        # deadline, so ``welcome`` is the only place the countdown can come from.
        assert datetime.fromisoformat(welcome["room"]["next_at"]) == next_at
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
    """T11: no question was open at the restart, so there is nothing to void, and nobody
    has a question opened on them the instant they reconnect either."""
    game = table("Zezima", seconds=10, reveal_seconds=30)
    game.start()
    game.opened(0)
    player = game.players[0]
    game.answer(player, 0, game.right(0))
    player.take("answer_ack")
    game.admin.send(t="skip")
    for seat in game.seats:
        seat.take("question_closed")
    assert game.room.phase == "reveal"

    assert evict(game.code) is True
    for seat in game.seats:
        assert closed_with(seat.ws) == 1012

    room = game.room
    assert not any(question.voided for question in room.questions)
    assert room.questions[0].closed_at is not None
    assert room.phase == "reveal"
    assert room.current_index == 0
    assert room.score(UUID(player.id)).points == 1000  # what was graded stays graded

    with client.websocket_connect(f"/ws/{game.code}") as ws:
        admin = reseat(game.admin, ws)
        welcome = admin.take("welcome")
        assert welcome["question"] is None
        assert welcome["room"]["phase"] == "reveal"
        assert [s["points"] for s in welcome["standings"]] == [1000, 0]
        # The resumed timer is a running timer: ``skip`` cuts its reveal short.
        admin.send(t="skip")
        assert admin.take("question_open")["question"]["index"] == 1
    assert db("select voided from questions where position = 0")[0]["voided"] is False


def test_a_restart_before_the_first_question_opened_still_plays_it(
    table, client, db, evict
) -> None:
    """T11: the gap inside ``start_game``, where ``playing`` and ``current_index = 0`` are
    in the database before question 0 is stamped ``shown_at``.

    A restart in there has nothing to void and is still owed that question, so the reveal
    ends by opening it rather than skipping past it. The row is edited behind the app's
    back because the window itself is too narrow to hit on purpose.
    """
    game = table("Zezima", seconds=10, reveal_seconds=30)
    db("update rooms set status = 'playing', current_index = 0 where code = $1", game.code)
    assert evict(game.code) is True
    for seat in game.seats:
        assert closed_with(seat.ws) == 1012

    room = game.room
    assert room.status == "playing"
    assert room.phase == "reveal"
    assert room.current_index == 0
    assert room.questions[0].shown_at is None
    assert not any(question.voided for question in room.questions)

    with client.websocket_connect(f"/ws/{game.code}") as ws:
        admin = reseat(game.admin, ws)
        assert admin.take("welcome")["question"] is None
        admin.send(t="skip")
        opened = admin.take("question_open")
        assert opened["question"]["index"] == 0  # the question the restart owed
    assert db("select current_index from rooms")[0]["current_index"] == 0


# --- the splash: a round's mode, introduced once ------------------------------------


def test_no_splash_when_splash_seconds_is_zero(game) -> None:
    """The default for every other test in this file: the frames are as they always were."""
    game.start()
    opened = game.opened(0)
    assert opened[0]["question"]["index"] == 0
    assert "splash" not in game.admin.kinds
    assert not any(
        message["t"] == "room_updated" and message["room"]["phase"] == "splash"
        for message in game.admin.seen
    )


def test_the_first_round_is_introduced_before_its_first_question(table) -> None:
    """The splash holds the room for ``splash_seconds``, then the question opens."""
    game = table("Zezima", seconds=10, splash_seconds=1)
    before = datetime.now(UTC)
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
    ends_at = datetime.fromisoformat(room["next_at"])
    assert 0 < (ends_at - before).total_seconds() <= 2
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
            {"mode": "more_less", "questions": 2, "seconds": 10},
            {"mode": second_mode, "questions": 1, "seconds": 10},
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
    game.admin.send(t="skip")
    game.admin.take("question_closed")
    game.admin.send(t="skip")
    second = game.admin.take("question_open")["question"]
    assert second["segment"] == first["segment"]  # same round, second question


def test_a_mode_is_a_round_and_every_round_is_introduced(table, second_mode) -> None:
    """The headline: two modes are two rounds, in the order the host listed them, each
    with a splash of its own because each plays something the one before it did not."""
    game = table(
        "Zezima",
        reveal_seconds=1,
        splash_seconds=1,
        modes=[
            {"mode": second_mode, "questions": 1, "seconds": 10},
            {"mode": "more_less", "questions": 1, "seconds": 10},
        ],
    )
    assert [q.mode for q in game.room.questions] == [second_mode, "more_less"]
    game.start()
    assert game.splash()["room"]["segment"]["mode"] == second_mode
    game.opened(0)
    game.admin.send(t="skip")
    game.admin.take("question_closed")
    game.admin.send(t="skip")
    assert game.splash()["room"]["segment"]["mode"] == "more_less"
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
    """T16: two rounds that answer the same way are still two modes, and every question
    says which one it belongs to as well as how it is answered."""
    game = table(
        "Zezima",
        reveal_seconds=1,
        modes=[
            {"mode": "more_less", "questions": 1, "seconds": 10},
            {"mode": second_mode, "questions": 1, "seconds": 10},
        ],
    )
    game.start()
    first = game.opened(0)[0]["question"]
    game.admin.send(t="skip")
    game.admin.take("question_closed")
    game.admin.send(t="skip")
    second = game.admin.take("question_open")["question"]
    assert [(q["type"], q["mode"], q["segment"]["mode"]) for q in (first, second)] == [
        ("more_less", "more_less", "more_less"),
        ("more_less", second_mode, second_mode),
    ]


def test_skip_cuts_the_splash_short(table) -> None:
    game = table("Zezima", seconds=10, splash_seconds=30)
    game.start()
    game.splash()
    started = time.monotonic()
    game.admin.send(t="skip")
    opened = game.admin.take("question_open")
    assert time.monotonic() - started < 1
    assert opened["question"]["index"] == 0


def test_a_player_cannot_skip_the_splash(table) -> None:
    game = table("Zezima", seconds=10, splash_seconds=30)
    game.start()
    game.splash(game.players[0])
    game.players[0].send(t="skip")
    assert game.players[0].take("error")["code"] == "not_admin"
    assert game.room.phase == "splash"


def test_welcome_during_a_splash_says_so(table, client) -> None:
    """A socket arriving mid-splash is told the same thing a live one was broadcast."""
    game = table("Zezima", seconds=10, splash_seconds=30)
    game.start()
    game.splash()
    body = join(client, game.code, "Latecomer").json()
    with client.websocket_connect(f"/ws/{game.code}") as ws:
        ws.send_json({"t": "hello", "session": body["session"]})
        welcome = ws.receive_json()
        assert welcome["t"] == "welcome"
        assert welcome["question"] is None  # nothing to answer yet
        assert welcome["room"]["phase"] == "splash"
        assert welcome["room"]["next_at"] is not None
        assert welcome["room"]["segment"]["mode"] == "more_less"
        assert welcome["room"]["segment"]["index"] == 0


def test_end_game_during_a_splash_voids_nothing(table, db) -> None:
    game = table("Zezima", seconds=10, splash_seconds=30)
    game.start()
    game.splash()
    game.admin.send(t="end_game")
    game.admin.take("game_finished")
    assert game.room.status == "finished"
    assert game.room.phase == "idle"
    assert not any(row["voided"] for row in db("select voided from questions"))


def test_a_restart_during_a_splash_replays_it(table, client, db, evict) -> None:
    """A splash is a question that has not opened, which recovery already handles."""
    game = table("Zezima", seconds=10, reveal_seconds=1, splash_seconds=1)
    game.start()
    for seat in game.seats:  # every socket, so none has a frame left to read at the close
        game.splash(seat)
    assert evict(game.code) is True
    for seat in game.seats:
        assert closed_with(seat.ws) == 1012

    room = game.room  # the rehydrate, and with it the recovery
    assert room.phase == "reveal"
    assert room.current_index == 0
    assert room.questions[0].shown_at is None
    assert not any(question.voided for question in room.questions)

    with client.websocket_connect(f"/ws/{game.code}") as ws:
        admin = reseat(game.admin, ws)
        assert admin.take("welcome")["room"]["phase"] == "reveal"
        # The reveal ends, and the round is introduced again before the question it owes.
        assert game.splash(admin)["room"]["phase"] == "splash"
        assert admin.take("question_open")["question"]["index"] == 0


# --- a mode's own question length ---------------------------------------------------


def test_a_question_lasts_what_its_own_mode_says(game) -> None:
    """The room has no question length: the round does, and this one is ten seconds."""
    assert game.room.settings.seconds_for("more_less") == 10
    game.start()
    view = game.opened(0)[0]["question"]
    opened_at = datetime.fromisoformat(view["opened_at"])
    ends_at = datetime.fromisoformat(view["ends_at"])
    assert (ends_at - opened_at).total_seconds() == 10
    assert game.question(0).seconds == 10


def test_a_mode_set_quicker_stays_quick(table) -> None:
    game = table("Zezima", seconds=5)
    game.start()
    view = game.opened(0)[0]["question"]
    opened_at = datetime.fromisoformat(view["opened_at"])
    ends_at = datetime.fromisoformat(view["ends_at"])
    assert (ends_at - opened_at).total_seconds() == 5


def test_a_stored_room_outside_the_types_range_is_clamped(table) -> None:
    """``NewRoomSettings`` refuses 30 seconds of ``more_less``; a room stored before the
    type said so still plays, at the longest the type allows."""
    game = table("Zezima", seconds=30)
    game.start()
    view = game.opened(0)[0]["question"]
    opened_at = datetime.fromisoformat(view["opened_at"])
    ends_at = datetime.fromisoformat(view["ends_at"])
    assert (ends_at - opened_at).total_seconds() == 20
    assert game.question(0).seconds == 20


def test_speed_buckets_scale_to_the_questions_own_length(game) -> None:
    """A ten-second question buckets on ten seconds, not on the length of a slower round."""
    game.start()
    game.opened(0)
    player = game.players[0]
    time.sleep(1.2)  # 12% of ten seconds is bucket 2; of thirty it would be bucket 1
    game.answer(player, 0, game.right(0))
    assert player.take("answer_ack")["band"] == 2


# --- T17: credit changed how points are computed, not what a game is worth ------------


def answer_after(game: Game, seat: Seat, index: int, value: Any, seconds: float) -> dict[str, Any]:
    """Answer question ``index`` as though ``seconds`` had passed since it opened.

    ``submit_answer`` measures elapsed time from the in-memory ``shown_at`` and nothing
    else, so moving that is how a test picks the bucket instead of racing the clock for
    it. The row in the database keeps the real one; nothing reads it while a question is
    open. Returns the ``answer_ack``.
    """
    question = game.question(index)
    question.shown_at = datetime.now(UTC) - timedelta(seconds=seconds)
    game.answer(seat, index, value)
    return seat.take("answer_ack")


# Into each ten-second bucket's middle, so a slow test run lands in the same one.
AFTER = {1: 0.3, 2: 1.75, 3: 3.75, 4: 6.25, 5: 8.75}

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
    """T17 Accept: credit replaced ``correct`` inside grading, and a ``more_less`` game
    comes out exactly as it did before, to the point and to the rank.

    The numbers are written out, not worked out: a test that recomputed them with the
    formula would agree with any formula at all. They are what this game scored on the
    ``points_for(correct, bucket)`` that T17 replaced.
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
        game.admin.send(t="skip")
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


def test_a_type_scored_on_rank_pays_the_same_early_or_late(table, monkeypatch) -> None:
    """T17: ``SCORING = RANK`` reaches the ack and the close, and the clock does not.

    Nothing ships a ``RANK`` type until ``closest_number`` (T21), so ``more_less`` wears
    it here. Its all-or-nothing credit is the top and bottom of the rank table.
    """
    monkeypatch.setattr(more_less, "SCORING", Scoring.RANK, raising=False)
    game = table("Zezima", "Woox", "Lynx", seconds=20, close_when_all_answered=False)
    zezima, woox, lynx = game.players
    game.start()
    game.opened(0)
    for seat, right, seconds in ((zezima, True, 1), (woox, True, 19), (lynx, False, 1)):
        value = game.right(0) if right else game.wrong(0)
        ack = answer_after(game, seat, 0, value, seconds)
        assert (ack["scoring"], ack["band"]) == ("rank", None)
    assert {answer.band for answer in game.question(0).answers.values()} == {None}
    game.admin.send(t="skip")
    closed = game.admin.take("question_closed")
    assert points_by_name(game, closed) == {"Zezima": 1000, "Woox": 1000, "Lynx": 0}


def test_a_type_scored_on_steps_pays_the_frame_the_answer_arrived_on(table, monkeypatch) -> None:
    """T17: ``SCORING = STEP`` with ``steps`` in the payload pays by the step, and without
    them it is ``SPEED`` -- in the ack as well as the points, so a client is never told a
    step number for a question that has no steps.

    Only Pixel Hunt's ``pick_from_list`` payloads will carry ``steps``, and that is Phase
    3, so the open question's in-memory payload is given four: 2.5 seconds a frame.
    """
    monkeypatch.setattr(more_less, "SCORING", Scoring.STEP, raising=False)
    game = table("Zezima", "Woox", seconds=10, close_when_all_answered=False)
    zezima, woox = game.players
    game.start()
    game.opened(0)
    game.question(0).payload["steps"] = 4
    first = answer_after(game, zezima, 0, game.right(0), 1.0)
    third = answer_after(game, woox, 0, game.right(0), 6.0)
    assert (first["scoring"], first["band"]) == ("step", 1)
    assert (third["scoring"], third["band"]) == ("step", 3)
    game.admin.send(t="skip")
    closed = game.admin.take("question_closed")
    assert points_by_name(game, closed) == {"Zezima": 1000, "Woox": 600}

    game.opened(1)
    assert "steps" not in game.question(1).payload
    ack = answer_after(game, zezima, 1, game.right(1), AFTER[2])
    assert (ack["scoring"], ack["band"]) == ("speed", 2)
    game.admin.send(t="skip")
    closed = game.admin.take("question_closed")
    assert points_by_name(game, closed) == {"Zezima": 900}


def test_partial_credit_scores_without_being_correct(table, db, monkeypatch) -> None:
    """T17: the road ``ordering`` (T27) will drive on, driven early.

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
    game.admin.send(t="skip")
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
