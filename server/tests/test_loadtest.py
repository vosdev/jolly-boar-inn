"""``scripts/loadtest.py``: the parts that need no server, its scheduling and its arithmetic."""

import json
import random
import sys
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest

from app.config import REPO_ROOT
from app.questions import custom, schema
from app.rooms.settings import NewRoomSettings

sys.path.insert(0, str(REPO_ROOT / "server" / "scripts"))

import loadtest  # noqa: E402

OPENED = datetime(2026, 11, 12, 20, 0, tzinfo=UTC)


def _question(hold: float = 4.2, answer: float = 8.0) -> dict[str, Any]:
    """A question_open's question with the three timestamps the server sends."""
    answerable = OPENED + timedelta(seconds=hold)
    return {
        "type": "multiple_choice",
        "view": {"options": ["a", "b", "c", "d"]},
        "opened_at": OPENED.isoformat(),
        "answerable_at": answerable.isoformat(),
        "ends_at": (answerable + timedelta(seconds=answer)).isoformat(),
    }


def _bounds(question: dict[str, Any]) -> tuple[float, float]:
    return (
        datetime.fromisoformat(question["answerable_at"]).timestamp(),
        datetime.fromisoformat(question["ends_at"]).timestamp(),
    )


@pytest.mark.parametrize("fraction", [loadtest.ANSWER_FRACTION, loadtest.EARLY_FRACTION])
def test_every_send_time_falls_between_answerable_at_and_ends_at(
    fraction: tuple[float, float],
) -> None:
    question = _question()
    answerable, ends = _bounds(question)
    rng = random.Random(1)
    times = [loadtest.send_time(question, OPENED.timestamp(), rng, fraction) for _ in range(5000)]
    assert all(t is not None and answerable <= t < ends for t in times)


def test_a_bot_back_from_a_reconnect_draws_from_what_is_left() -> None:
    question = _question()
    _, ends = _bounds(question)
    now = ends - 2.0
    rng = random.Random(2)
    times = [loadtest.send_time(question, now, rng) for _ in range(2000)]
    assert all(t is not None and now <= t < ends for t in times)


def test_a_closed_question_gets_no_send_time() -> None:
    question = _question()
    _, ends = _bounds(question)
    assert loadtest.send_time(question, ends, random.Random(3)) is None


def test_the_budget_covers_every_question_its_hold_and_its_reveal() -> None:
    question = _question(hold=4.2, answer=8.0)
    reveal = 5.0
    span = 12.2
    for questions in (1, 5, 14, 30):
        assert loadtest.budget(questions, question, reveal) >= questions * (span + reveal)


def test_the_reveal_estimate_is_the_types_own_at_the_pace() -> None:
    # Four options at teleport: (4 + 0.5 * 4) * 0.75 rounds to 5, and the names add one.
    assert loadtest.reveal_estimate(_question(), "teleport") == 6.0


@pytest.mark.parametrize("questions", range(1, 31))
def test_every_count_up_to_thirty_is_a_room_that_plays_exactly_that(questions: int) -> None:
    room = loadtest.plan(questions)
    assert room is not None
    settings = NewRoomSettings(
        modes=[{"mode": loadtest.MODE, "questions": room.round_questions}],
        random_event_frequency=room.frequency,
    )
    assert room.round_questions + settings.random_event_slots == questions
    assert room.custom == settings.random_event_slots


def test_the_committed_pack_holds_every_round_the_plans_ask_for() -> None:
    pack = json.loads((REPO_ROOT / "data" / "packs" / f"{loadtest.MODE}.json").read_text())
    held = sum(1 for q in pack["questions"] if q["mode"] == loadtest.MODE)
    longest = max(loadtest.plan(n).round_questions for n in range(1, 31))  # type: ignore[union-attr]
    assert held >= longest


def test_the_scripts_own_questions_are_valid_and_distinct() -> None:
    envelopes = custom.envelopes(loadtest.custom_questions(6))
    for envelope in envelopes:
        schema.validate(envelope)
    assert len({envelope["id"] for envelope in envelopes}) == 6


def test_every_bot_gets_its_own_address() -> None:
    addresses = loadtest.bot_addresses(900, random.Random(4))
    assert len(set(addresses)) == 900
    assert all(loadtest.ADDRESSES.overlaps(loadtest.ipaddress.ip_network(a)) for a in addresses)


def test_reconnects_alternate_between_answered_and_still_to_answer() -> None:
    assert [loadtest.Run.drops_after_answering(i) for i in range(4)] == [False, True, False, True]
