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


def _args(**overrides: Any) -> Any:
    args = loadtest.parse_args(["--database-url", "postgresql://x@localhost/x"])
    for key, value in overrides.items():
        setattr(args, key, value)
    return args


def test_a_buzzer_answers_two_seconds_after_answerable_at() -> None:
    question = _question(answer=8.0)
    answerable, ends = _bounds(question)
    assert loadtest.buzzer_time(question, OPENED.timestamp()) == answerable + 2.0
    assert loadtest.buzzer_time(question, ends) is None


def test_a_buzzer_in_a_short_window_answers_in_its_middle() -> None:
    question = _question(answer=3.0)
    answerable, _ = _bounds(question)
    assert loadtest.buzzer_time(question, OPENED.timestamp()) == answerable + 1.5


def test_a_storm_drops_at_the_middle_of_the_window() -> None:
    question = _question(answer=8.0)
    answerable, _ = _bounds(question)
    assert loadtest.storm_time(question) == answerable + 4.0


def test_slow_readers_stall_for_the_second_half() -> None:
    assert [loadtest.slow_from(n) for n in (2, 3, 6)] == [1, 1, 3]


def test_worker_plans_deal_every_room_once_with_its_own_addresses() -> None:
    args = _args(rooms=7, bots=5, procs=3, ramp=14.0, games=2, seed=9)
    addresses = loadtest.bot_addresses(2 * 7 * 5, random.Random(5))
    seen: list[str] = []
    for game in range(2):
        works = loadtest.worker_plans(args, game, addresses)
        assert len(works) == 3
        rooms = sorted((s for w in works for s in w.rooms), key=lambda s: s.index)
        assert [s.index for s in rooms] == list(range(7))
        assert [s.offset for s in rooms] == [i * 2.0 for i in range(7)]
        assert sum(s.narrate for s in rooms) == 1
        seen += [a for s in rooms for a in s.addresses]
        assert all(len(s.addresses) == 5 for s in rooms)
    assert len(seen) == len(set(seen)) == 70


def test_a_join_burst_splits_its_concurrency_over_the_processes() -> None:
    works = loadtest.worker_plans(_args(rooms=4, procs=2, scenario="join-burst"), 0, ["a"] * 240)
    assert [w.concurrency for w in works] == [30, 30]
    steady = loadtest.worker_plans(_args(rooms=4, procs=2), 0, ["a"] * 240)
    assert [w.concurrency for w in steady] == [loadtest.SETUP_CONCURRENCY] * 2


def test_slow_readers_count_against_the_room_cap() -> None:
    args = _args(bots=47, scenario="slow-readers", slow_readers=5, questions=6)
    assert any("52 players" in p for p in loadtest.problems(args, 50))
    assert loadtest.problems(_args(bots=45, scenario="slow-readers", questions=6), 50) == []
    assert loadtest.problems(_args(bots=50), 50) == []


def test_impossible_arguments_are_named() -> None:
    found = loadtest.problems(_args(rooms=2, procs=3, ramp=-1.0, bots=51), 50)
    assert len(found) == 3


def test_metrics_summary_takes_deltas_by_label() -> None:
    before = loadtest.parse_metrics(
        'jbi_rate_limited_total{limiter="join"} 2.0\n'
        'jbi_ws_disconnects_total{reason="client"} 5.0\n'
        'jbi_event_loop_lag_seconds_bucket{le="0.1"} 10.0\n'
        "jbi_event_loop_lag_seconds_count 10.0\n"
    )
    after = loadtest.parse_metrics(
        "# HELP jbi_rate_limited_total Requests refused.\n"
        'jbi_rate_limited_total{limiter="join"} 2.0\n'
        'jbi_ws_disconnects_total{reason="client"} 9.0\n'
        'jbi_event_loop_lag_seconds_bucket{le="0.1"} 18.0\n'
        "jbi_event_loop_lag_seconds_count 20.0\n"
        "jbi_db_pool_size 3.0\n"
    )
    summary = loadtest.metrics_summary(before, after)
    assert summary["rate_limited_total"] == 0
    assert summary["ws_disconnects"] == {"client": 4.0}
    assert summary["lag_samples"] == 10 and summary["lag_over_100ms"] == 2
    assert summary["db_pool_size"] == 3.0


def test_process_summary_reads_cpu_and_rss_per_socket() -> None:
    samples = [(0.0, 0, 80_000), (1.0, 50, 90_000), (2.0, 100, 85_000)]
    summary = loadtest.process_summary(samples, [2], rooms=2, sockets=100, ticks_per_second=100)
    assert summary is not None
    assert summary["cpu_pct_avg"] == 50.0 and summary["cpu_pct_per_room"] == 25.0
    assert summary["rss_per_socket_kb"] == 100.0
    assert summary["rss_game_end_kb"] == [85_000]


def _worker(acks: list[list[float]], rows_ok: bool = True) -> dict[str, Any]:
    room = {
        "code": "RoomA",
        "index": 0,
        "game": 0,
        "bots": 2,
        "slow_readers": 0,
        "total": 2,
        "played": 2,
        "acks": acks,
        "sent": len(acks),
        "acked": len(acks),
        "missed": 0,
        "finished": 2,
        "standings_distinct": 1,
        "top": [],
        "errors": [],
        "closes": {},
        "reconnects": {"attempted": 2, "completed": 2, "answered": 1, "pending": 1, "between": 0},
        "first_welcomes": [0.01, 0.02],
        "welcomes": [0.01, 0.01],
        "stalled": [],
        "stall_at": None,
        "server_version": "0.0.1",
        "offset_ms": 0.0,
    }
    return {"rooms": [room], "joins": [[0.01, 200]], "loop_lag": loadtest.stats([0.001] * 10)}


def _report(seconds: float, **args: Any) -> dict[str, Any]:
    acks = [[seconds, 0], [seconds, 0], [seconds, 1], [seconds, 1]]
    base = {"scenario": "steady", "questions": 2, "p99_ms": 200.0, "smoke": True, **args}
    report = loadtest.build_report(base, [_worker(acks)], {"RoomA": 4}, None, None, None)
    report["checks"] = loadtest.evaluate(report)
    return report


def test_the_report_holds_what_a_later_run_compares_against() -> None:
    report = _report(0.01)
    json.dumps(report)
    assert report["acks"]["p99_ms"] == 10.0
    assert [q["question"] for q in report["per_question"]] == [1, 2]
    assert report["rooms"][0]["rows"] == 4
    assert {"version", "git_sha", "args", "scenario", "server", "harness"} <= report.keys()
    assert all(check["passed"] for check in report["checks"])
    assert loadtest.validity(report)[0]


def test_a_room_short_of_rows_or_over_budget_fails() -> None:
    report = _report(0.3)
    failed = {c["name"] for c in report["checks"] if not c["passed"]}
    assert failed == {"ack p99", "worst room ack p99"}
    short = loadtest.build_report(
        {"scenario": "steady", "questions": 2, "p99_ms": 200.0, "smoke": True},
        [_worker([[0.01, 0]] * 4)],
        {"RoomA": 3},
        None,
        None,
        None,
    )
    assert not next(c for c in loadtest.evaluate(short) if c["name"] == "answers rows")["passed"]


def test_a_buzzer_run_fails_on_its_slowest_ack() -> None:
    report = _report(0.25, scenario="buzzer", smoke=False, p99_ms=1000.0)
    assert not next(c for c in report["checks"] if c["name"] == "buzzer last ack")["passed"]


def test_a_lagging_harness_makes_the_run_invalid() -> None:
    report = _report(0.01)
    report["harness"]["loop_lag"] = loadtest.stats([0.03] * 10)
    assert not loadtest.validity(report)[0]


def test_compare_passes_on_identical_reports_and_fails_when_p99_doubles() -> None:
    old = _report(0.01)
    assert [c["passed"] for c in loadtest.compare(old, old, 1.5)] == [True]
    worse = _report(0.02)
    assert [c["passed"] for c in loadtest.compare(old, worse, 1.5)] == [False]


def test_compare_holds_cpu_and_rss_as_ratios() -> None:
    old = {
        "acks": {"p99_ms": 10.0},
        "server": {"process": {"cpu_pct_per_room": 1.0, "rss_per_socket_kb": 60.0}},
    }
    new = {
        "acks": {"p99_ms": 12.0},
        "server": {"process": {"cpu_pct_per_room": 2.0, "rss_per_socket_kb": 60.0}},
    }
    assert [c["passed"] for c in loadtest.compare(old, new, 1.5)] == [True, False, True]


def test_join_latencies_fall_into_their_buckets() -> None:
    counts = loadtest.histogram([0.01, 0.05, 0.2, 9.0])
    assert counts["50"] == 2 and counts["250"] == 1 and counts["+Inf"] == 1
