"""T9 Accept: with ``question_seconds = 1`` and ``reveal_seconds = 1`` a 3-question room
runs to ``finished`` unattended; an answer after the close is ``not_open``; a second
answer is ``already_answered``; all-answered closes early; ``start_game`` from a
non-admin is ``not_admin``; ``skip`` during a question closes within 100 ms.

T10 Accept (the database half; the bucket and standings tables are in test_scoring.py):
grading writes ``correct`` and ``points``, ``question_closed`` carries the per-player
results, the sum held in memory equals ``sum(points)`` from the database after every
close, and ``host_only`` and the author of a room question cannot answer.

Plus the rest of the section 3 and 4 surface these two tasks own: ``question_open`` (and
what it withholds), ``answer_ack``, auto-advance, ``game_finished``, reconnecting
mid-question, ``skip`` during a reveal, ``end_game``, ``promote`` and ``kick``.

Most tests run with 30-second questions and drive the closes themselves with ``skip``,
so what they assert is the state machine and not the wall clock. The ones that are about
time say so.
"""

import time
from collections.abc import Callable, Iterator
from contextlib import ExitStack
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from starlette.testclient import WebSocketTestSession
from starlette.websockets import WebSocketDisconnect

from app.questions.types import higher_lower
from app.rooms.state import BadState, Room, RoomQuestion
from tests.rooms_api import call, claim, create_fast, join


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

    def right(self, index: int) -> str:
        return self.question(index).payload["answer"]

    def wrong(self, index: int) -> str:
        return "higher" if self.right(index) == "lower" else "lower"

    def start(self) -> None:
        self.admin.send(t="start_game")

    def answer(self, seat: Seat, index: int, value: Any) -> None:
        seat.send(t="answer", question_id=self.question(index).question_id, value=value)

    def opened(self, index: int) -> list[dict[str, Any]]:
        """Everyone's ``question_open`` for question ``index``."""
        messages = [seat.take("question_open") for seat in self.seats]
        assert {m["question"]["index"] for m in messages} == {index}
        return messages


@pytest.fixture
def table(app: FastAPI, client: TestClient) -> Iterator[Callable[..., Game]]:
    """``table("Zezima", "Woox", question_seconds=1)`` → a lobby with everyone connected.

    Seat 0 is always the admin. Sockets close when the test ends, before the app does.
    """
    with ExitStack() as stack:

        def build(*names: str, **settings: Any) -> Game:
            room, token = create_fast(app, client, **settings)
            bodies = [claim(client, room.code, token, "Admin").json()]
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
    """Three 30-second questions, an admin and two players, all connected."""
    return table("Zezima", "Woox", question_seconds=30, reveal_seconds=1)


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
    game = table("Zezima", "Woox", question_seconds=1, reveal_seconds=1)
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
    game = table("Zezima", question_seconds=1, reveal_seconds=1)
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
    assert view["type"] == "higher_lower"
    assert view["total"] == 3
    assert view["you_can_answer"] is True
    assert view["view"] == higher_lower.client_view(question.payload)
    assert "answer" not in view["view"]
    assert "value" not in view["view"]["target"]
    assert str(question.payload["target"]["value"]) not in str(opened[0])
    ends_at = datetime.fromisoformat(view["ends_at"])
    opened_at = datetime.fromisoformat(view["opened_at"])
    assert (ends_at - opened_at).total_seconds() == 30  # the room's question_seconds
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
    room, token = create_fast(app, client)
    admin = claim(client, room.code, token, "Admin").json()
    with client.websocket_connect(f"/ws/{room.code}") as ws:
        ws.send_json({"t": "hello", "session": admin["session"]})
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


def admin_player(client: TestClient, manager, code: str):
    room = call(client, manager.get, code)
    return next(player for player in room.players.values() if player.role == "admin")


def test_start_game_needs_somebody_connected(app, client) -> None:
    """Section 4's guard: at least one connected player."""
    room, token = create_fast(app, client)
    claim(client, room.code, token, "Admin")
    manager = app.state.rooms
    with pytest.raises(BadState) as info:
        call(client, manager.start_game, room.code, admin_player(client, manager, room.code))
    assert info.value.message == "nobody is connected to play"
    assert call(client, manager.get, room.code).status == "lobby"


def test_start_game_needs_questions(app, client) -> None:
    """Section 4's other guard. Only reachable with a room built behind the API's back."""
    room, token = create_fast(app, client, question_count=0)
    admin = claim(client, room.code, token, "Admin").json()
    manager = app.state.rooms
    assert call(client, manager.get, room.code).questions == []
    with client.websocket_connect(f"/ws/{room.code}") as ws:
        ws.send_json({"t": "hello", "session": admin["session"]})
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
    assert ack == {"t": "answer_ack", "question_id": game.question(0).question_id, "bucket": 1}
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
    game = table("Zezima", question_seconds=1, reveal_seconds=30)
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
    game = table("Zezima", question_seconds=30, reveal_seconds=30)
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
    game = table("Zezima", question_seconds=1, reveal_seconds=1)
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
    game = table("Zezima", question_seconds=1, reveal_seconds=1)
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

    assert closed["reveal"] == higher_lower.reveal(game.question(0).payload)
    assert closed["results"] == {
        right.id: {"value": game.right(0), "correct": True, "points": 1000},
        wrong.id: {"value": game.wrong(0), "correct": False, "points": 0},
    }
    assert game.admin.id not in closed["results"]  # the admin never answered
    assert closed["standings"] == [
        {"player_id": right.id, "display_name": right.name, "points": 1000, "rank": 1},
        {"player_id": game.admin.id, "display_name": "Admin", "points": 0, "rank": 2},
        {"player_id": wrong.id, "display_name": wrong.name, "points": 0, "rank": 2},
    ]
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
    game = table("Zezima", question_seconds=30, reveal_seconds=30)
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
        type="higher_lower",
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
    assert closed["reveal"] == higher_lower.reveal(game.question(0).payload)
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
