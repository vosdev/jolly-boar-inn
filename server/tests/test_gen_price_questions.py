"""The generator produces about 100 valid questions, ``validate_packs.py``
passes on the output, the script is idempotent, and nothing runs it at app startup or in
CI. The generator is exercised on saved-response fixtures; the network is never touched.

The generator half: it emits ``price_is_right`` from the same fetch, rounded
with its answer inside a range drawn for it, without moving a single ``more_less``
question; it stays idempotent and offline-capable. The type and the shipped pack's
properties are in ``test_price_is_right.py``.
"""

import json
import os
import subprocess
import sys
from collections import Counter
from pathlib import Path
from typing import Any

import pytest

from app.config import REPO_ROOT
from app.questions import schema
from app.questions.packs import load_packs, pack_errors
from app.questions.types import slider
from tests.packs import PACKS_DIR

SERVER_DIR = REPO_ROOT / "server"
sys.path.insert(0, str(SERVER_DIR / "scripts"))

import gen_price_questions as gen  # noqa: E402
import wiki  # noqa: E402

# A ladder of 12 tradeables 12% apart. The window is 1.25x..4x, so neighbours are too
# close to make a question and everything two or more rungs apart is in: 55 pairs per
# metric. Plus an isolated expensive item, an untradeable, and a bond with a price but no
# high alch.
LADDER = [
    (9000 + k, f"Ladder {k:02d}", round(1000 * 1.12**k), round(500 * 1.12**k)) for k in range(12)
]
ROSTER = [
    {"id": 4151, "name": "Abyssal whip"},
    {"id": 7462, "name": "Barrows gloves"},  # untradeable: absent from /mapping
    {"id": 13190, "name": "Old school bond"},  # no highalch
    *({"id": item_id, "name": name} for item_id, name, _, _ in LADDER),
]
MAPPING = [
    {"id": 4151, "name": "Abyssal whip", "highalch": 72000, "examine": "A weapon from the abyss."},
    {"id": 13190, "name": "Old school bond"},
    {"id": 99999, "name": "Not in roster", "highalch": 1000},
    *({"id": item_id, "name": name, "highalch": alch} for item_id, name, _, alch in LADDER),
]
LATEST = {
    "data": {
        "4151": {"high": 1660000, "highTime": 1789771644, "low": 1640000, "lowTime": 1789771567},
        "13190": {"high": 1070, "highTime": 1789771300, "low": 1050, "lowTime": None},
        "99999": {"high": 1000, "highTime": 1789771700, "low": 1000, "lowTime": 1789771700},
        **{
            str(item_id): {"high": price, "highTime": 1789770000 + k, "low": None, "lowTime": None}
            for k, (item_id, _, price, _) in enumerate(LADDER)
        },
    }
}
NEWEST = "2026-09-18T22:47:24Z"  # 1789771644 in UTC
GE_PAIRS = 55 + 9  # ladder pairs, plus the bond (1060 gp) with Ladder 03 and up
HIGH_ALCH_PAIRS = 55  # the bond has no high alch, and nothing is near the whip's 72k
PRICED = 12 + 2  # every item with a GE price: the ladder, the whip and the bond


def _write_inputs(directory: Path) -> dict[str, Path]:
    paths = {
        "roster": directory / "popular-items.json",
        "mapping": directory / "mapping.json",
        "latest": directory / "latest.json",
    }
    paths["roster"].write_text(json.dumps({"_comment": [], "items": ROSTER}))
    paths["mapping"].write_text(json.dumps(MAPPING))
    paths["latest"].write_text(json.dumps(LATEST))
    return paths


def _run_script(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, "scripts/gen_price_questions.py", *args],
        cwd=SERVER_DIR,
        env={**os.environ, "PYTHONPATH": str(SERVER_DIR)},
        capture_output=True,
        text=True,
        check=False,
    )


def _mode(pack: dict[str, Any], mode: str) -> list[dict[str, Any]]:
    return [q for q in pack["questions"] if q["mode"] == mode]


def _ratio(question: dict[str, Any]) -> float:
    lo, hi = sorted(option["value"] for option in question["payload"]["options"])
    return hi / lo


def _names(pack: dict[str, Any]) -> set[tuple[str, str]]:
    return {
        (q["payload"]["metric"], option["subject"]["name"])
        for q in _mode(pack, "more_less")
        for option in q["payload"]["options"]
    }


@pytest.fixture(autouse=True)
def no_network(monkeypatch: pytest.MonkeyPatch) -> None:
    def refuse(*args: Any, **kwargs: Any) -> None:
        raise AssertionError("tests must not touch the network")

    monkeypatch.setattr(wiki.urllib.request, "urlopen", refuse)


# --- shipped pack ----------------------------------------------------------------------


def test_shipped_prices_pack_is_full_of_valid_questions() -> None:
    """Produces the asked-for count of valid questions; validate_packs.py passes."""
    packs = load_packs(PACKS_DIR)
    prices = next(pack for pack in packs if pack.path.name == "prices.json")
    assert prices.name == gen.PACK_NAME
    more_less = [q for q in prices.questions if q["mode"] == "more_less"]
    assert len(more_less) == gen.DEFAULT_COUNT
    assert {q["mode"] for q in prices.questions} == {"more_less", "price_is_right"}
    metrics = {q["payload"]["metric"] for q in more_less}
    assert metrics == set(gen.METRIC_SHARE)
    directions = {q["payload"]["direction"] for q in more_less}
    assert directions == {"more", "less"}, "both directions have to turn up"
    for q in more_less:
        assert q["type"] == "more_less"
        assert q["mode"] == "more_less"
        assert q["source"] == "pack"
        assert "prices" in q["tags"]
        assert q["id"] == schema.content_id(q)
        assert gen.MIN_RATIO <= _ratio(q) <= gen.MAX_RATIO, q["id"]


# --- generate() ------------------------------------------------------------------------


def test_generate_is_valid_and_deterministic() -> None:
    """Idempotent, given the same inputs the output is identical."""
    pack, notes = gen.generate(ROSTER, MAPPING, LATEST, count=10)
    again, _ = gen.generate(ROSTER, MAPPING, LATEST, count=10)
    assert gen.render(pack) == gen.render(again)
    assert pack_errors(pack, "prices") == []
    assert pack["pack"] == "prices"
    assert pack["generated_at"] == NEWEST
    assert len(_mode(pack, "more_less")) == 10
    assert [q["payload"]["metric"] for q in _mode(pack, "more_less")].count("ge_price") == 7
    assert all("skip" in n or "no highalch" in n or "price_is_right" in n for n in notes)
    for q in _mode(pack, "more_less"):
        assert q["payload"]["as_of"] == "2026-09-18"
        assert q["difficulty"] in ("easy", "medium", "hard")
        assert q["tags"] == gen.TAGS[q["payload"]["metric"]]


def test_generate_only_pairs_items_of_similar_value() -> None:
    """Every question compares values inside the window, so neither end is a coin flip."""
    pack, _ = gen.generate(ROSTER, MAPPING, LATEST, count=GE_PAIRS + HIGH_ALCH_PAIRS)
    assert len(_mode(pack, "more_less")) == GE_PAIRS + HIGH_ALCH_PAIRS
    for q in _mode(pack, "more_less"):
        assert gen.MIN_RATIO <= _ratio(q) <= gen.MAX_RATIO
    assert ("ge_price", "Abyssal whip") not in _names(pack)  # nothing is near 1.65m


def test_generate_skips_untradeable_and_missing_metrics() -> None:
    pack, notes = gen.generate(ROSTER, MAPPING, LATEST, count=40)
    names = _names(pack)
    assert not any(name == "Barrows gloves" for _, name in names)
    assert ("high_alch", "Old school bond") not in names
    assert ("ge_price", "Old school bond") in names
    assert not any(name == "Not in roster" for _, name in names)
    assert any("Barrows gloves" in note and "not tradeable" in note for note in notes)
    assert any("Old school bond" in note and "high_alch" in note for note in notes)


def test_generate_tops_up_a_short_metric_from_the_others() -> None:
    """70/30 wants 70 ge_price of 100, only 64 exist: high_alch fills the gap."""
    pack, notes = gen.generate(ROSTER, MAPPING, LATEST, count=100)
    metrics = [q["payload"]["metric"] for q in _mode(pack, "more_less")]
    assert metrics.count("ge_price") == GE_PAIRS
    assert metrics.count("high_alch") == 100 - GE_PAIRS
    assert any(n.startswith("ge_price: 64 pair(s)") and "using 64" in n for n in notes)
    assert any(n.startswith("high_alch: 55 pair(s)") and "using 36" in n for n in notes)
    assert not any(n.startswith("only ") for n in notes), "more_less fell short"


def test_generate_seed_changes_selection() -> None:
    a, _ = gen.generate(ROSTER, MAPPING, LATEST, count=10, seed=1)
    b, _ = gen.generate(ROSTER, MAPPING, LATEST, count=10, seed=2)
    assert [q["id"] for q in a["questions"]] != [q["id"] for q in b["questions"]]


def test_generate_reports_shortfall_without_failing() -> None:
    pack, notes = gen.generate(ROSTER, MAPPING, LATEST, count=1000)
    assert len(_mode(pack, "more_less")) == GE_PAIRS + HIGH_ALCH_PAIRS
    assert any(n.startswith("only 119 of 1000 questions possible") for n in notes)
    assert pack_errors(pack, "prices") == []
    ids = [q["id"] for q in pack["questions"]]
    assert len(ids) == len(set(ids))


def test_name_mismatch_is_an_error() -> None:
    roster = [dict(item) for item in ROSTER]
    roster[0]["name"] = "Abyssal tentacle"
    with pytest.raises(gen.RosterError) as info:
        gen.generate(roster, MAPPING, LATEST)
    assert info.value.errors == [
        "Abyssal tentacle (4151): /mapping calls this id 'Abyssal whip';"
        " fix the id or the name in the roster"
    ]


# --- building blocks -------------------------------------------------------------------


@pytest.mark.parametrize(
    ("entry", "expected"),
    [
        (None, None),
        ({"high": None, "low": None}, None),
        ({"high": 100, "low": None}, 100),
        ({"high": None, "low": 90}, 90),
        ({"high": 101, "low": 90}, 95),
    ],
)
def test_ge_price(entry: dict[str, Any] | None, expected: int | None) -> None:
    assert gen.ge_price(entry) == expected


def test_candidate_pairs_keep_only_similar_values() -> None:
    items, _ = gen.build_items(ROSTER, MAPPING, LATEST)
    by_name = {item.name: item for item in items}
    pairs = gen.candidate_pairs(items, "ge_price")
    assert len(pairs) == GE_PAIRS
    assert (by_name["Ladder 00"], by_name["Ladder 01"]) not in pairs  # 12%: a coin flip
    assert (by_name["Ladder 00"], by_name["Ladder 02"]) in pairs  # 25% apart
    assert (by_name["Ladder 00"], by_name["Ladder 03"]) in pairs  # 40% apart
    assert (by_name["Ladder 00"], by_name["Ladder 11"]) in pairs  # 3.5x, still inside
    assert (by_name["Ladder 00"], by_name["Old school bond"]) not in pairs  # 6%: coin flip
    assert (by_name["Ladder 03"], by_name["Old school bond"]) in pairs  # 33% apart
    assert not any(by_name["Abyssal whip"] in pair for pair in pairs)
    assert len(gen.candidate_pairs(items, "high_alch")) == HIGH_ALCH_PAIRS


def test_pick_pairs_spreads_items_and_fills_up() -> None:
    items, _ = gen.build_items(ROSTER, MAPPING, LATEST)
    pairs = gen.candidate_pairs(items, "ge_price")
    chosen = gen.pick_pairs(pairs, 8, gen.random.Random(0))
    assert len(chosen) == 8 and len(set(chosen)) == 8
    all_of_them = gen.pick_pairs(pairs, len(pairs) + 5, gen.random.Random(0))
    assert sorted(all_of_them, key=lambda p: (p[0].id, p[1].id)) == sorted(
        pairs, key=lambda p: (p[0].id, p[1].id)
    )


@pytest.mark.parametrize(
    ("a", "b", "expected"),
    [(100, 250, "easy"), (250, 100, "easy"), (100, 160, "medium"), (100, 159, "hard")],
)
def test_difficulty(a: int, b: int, expected: str) -> None:
    assert gen.difficulty(a, b) == expected


def test_metric_counts_add_up() -> None:
    for count in (1, 2, 3, 7, 100, 101):
        counts = gen.metric_counts(count)
        assert sum(counts.values()) == count
        assert set(counts) == set(gen.METRIC_SHARE)


def test_allocate() -> None:
    plenty = {"ge_price": 500, "high_alch": 500}
    assert gen.allocate(100, plenty) == {"ge_price": 70, "high_alch": 30}
    assert gen.allocate(100, {"ge_price": 48, "high_alch": 63}) == {"ge_price": 48, "high_alch": 52}
    assert gen.allocate(100, {"ge_price": 90, "high_alch": 5}) == {"ge_price": 90, "high_alch": 5}
    assert gen.allocate(100, {"ge_price": 10, "high_alch": 10}) == {"ge_price": 10, "high_alch": 10}
    assert gen.allocate(100, {"ge_price": 0, "high_alch": 0}) == {"ge_price": 0, "high_alch": 0}


def test_make_question_matches_more_less_contract() -> None:
    whip = gen.Item(4151, "Abyssal whip", 1650000, 72000)
    scim = gen.Item(4587, "Dragon scimitar", 60000, 60000)
    q = gen.make_question("ge_price", whip, scim, "more", "2026-09-01")
    schema.validate(q)
    assert q["payload"]["answer_index"] == 0  # the whip is the dearer of the two
    assert q["payload"]["direction"] == "more"
    assert q["payload"]["options"][0]["subject"] == {"name": "Abyssal whip", "asset": "item:4151"}
    # The direction is the only thing that moves the answer; the order is unchanged.
    less = gen.make_question("ge_price", whip, scim, "less", "2026-09-01")
    schema.validate(less)
    assert less["payload"]["answer_index"] == 1
    assert (
        gen.make_question("high_alch", scim, whip, "more", "2026-09-01")["payload"]["answer_index"]
        == 1
    )


# --- the price is right ----------------------------------------------------------------


def test_price_is_right_does_not_move_a_single_more_less_question() -> None:
    """Its own stream is what keeps "do not change the more_less questions" true."""
    with_pir, _ = gen.generate(ROSTER, MAPPING, LATEST, count=40)
    without, _ = gen.generate(ROSTER, MAPPING, LATEST, count=40, pir_count=0)
    assert _mode(with_pir, "more_less") == without["questions"]
    assert _mode(without, "price_is_right") == []


def test_price_is_right_comes_from_the_same_fetch() -> None:
    """One question per priced item, its answer that item's GE price from ``/latest``."""
    pack, _ = gen.generate(ROSTER, MAPPING, LATEST, count=10)
    pir = _mode(pack, "price_is_right")
    assert pack_errors(pack, "prices") == []
    assert len(pir) == PRICED
    items = {item.name: item for item in gen.build_items(ROSTER, MAPPING, LATEST)[0]}
    for q in pir:
        p = q["payload"]
        item = items[p["subject"]["name"]]
        assert p["subject"]["asset"] == f"item:{item.id}"
        assert p["value"] == gen.round_price(item.ge_price)
        assert p["min"] < p["value"] < p["max"]
        assert p["as_of"] == "2026-09-18"
        assert q["tags"] == gen.PIR_TAGS
        assert q["difficulty"] in ("easy", "medium", "hard")
    assert "Barrows gloves" not in {q["payload"]["subject"]["name"] for q in pir}


def test_price_is_right_is_deterministic_and_seeded() -> None:
    a, _ = gen.generate(ROSTER, MAPPING, LATEST, count=10)
    b, _ = gen.generate(ROSTER, MAPPING, LATEST, count=10)
    c, _ = gen.generate(ROSTER, MAPPING, LATEST, count=10, seed=1)
    assert gen.render(a) == gen.render(b)
    assert _mode(a, "price_is_right") != _mode(c, "price_is_right")


@pytest.mark.parametrize(
    ("value", "rounded"),
    [
        (0, 0),
        (57, 57),
        (99, 99),
        (100, 100),
        (104, 100),
        (105, 110),
        (999, 1000),
        (12_500, 13_000),
        (99_999, 100_000),
        (1_337_000, 1_300_000),
        (1_650_000, 1_700_000),
        (9_999_999, 10_000_000),
        (1_234_567_890, 1_200_000_000),
    ],
)
def test_round_price_keeps_two_figures(value: int, rounded: int) -> None:
    assert gen.round_price(value) == rounded


@pytest.mark.parametrize("price", [100, 990, 1_000, 13_000, 1_700_000, 95_000_000])
def test_every_range_puts_the_answer_in_a_band(price: int) -> None:
    """Never in the outer 10% at either end, never in the middle 10% where the slider starts."""
    for seed in range(200):
        fitted = gen.price_range(price, gen.random.Random(seed))
        assert fitted is not None
        low, high = fitted
        where = slider.position(price, low, high)
        assert 0.10 <= where <= 0.45 or 0.55 <= where <= 0.90, (seed, low, high, where)
        assert gen.round_price(low) == low and gen.round_price(high) == high
        assert 1.5 <= high / low <= 3.6, (seed, low, high)


def test_the_ranges_fill_both_bands() -> None:
    sides = Counter(
        slider.position(13_000, *(gen.price_range(13_000, gen.random.Random(seed)) or (0, 0))) < 0.5
        for seed in range(200)
    )
    assert min(sides.values()) >= 70, sides


def test_an_item_near_max_cash_stays_under_it() -> None:
    bow = gen.Item(20997, "Twisted bow", 1_500_000_000, None)
    questions, _ = gen.price_is_right_questions([bow], 1, "2026-09-18", gen.random.Random(0))
    (q,) = questions
    assert q["payload"]["max"] <= gen.MAX_CASH


def test_an_item_with_no_room_above_is_skipped() -> None:
    item = gen.Item(1, "Hoard", 2_100_000_000, None)
    questions, notes = gen.price_is_right_questions([item], 1, "2026-09-18", gen.random.Random(0))
    assert questions == []
    assert "price_is_right: no range fits Hoard at 2100000000 gp, skipped" in notes


@pytest.mark.parametrize(
    ("low", "high", "expected"), [(10, 25, "easy"), (10, 19, "medium"), (10, 18, "hard")]
)
def test_pir_difficulty_by_span(low: int, high: int, expected: str) -> None:
    assert gen.pir_difficulty(low, high) == expected


def test_price_is_right_skips_items_worth_a_handful_of_coins() -> None:
    items = [gen.Item(314, "Feather", 3, 1), gen.Item(4151, "Abyssal whip", 1_650_000, 72_000)]
    questions, notes = gen.price_is_right_questions(items, 5, "2026-09-18", gen.random.Random(0))
    assert [q["payload"]["subject"]["name"] for q in questions] == ["Abyssal whip"]
    assert f"price_is_right: 1 item(s) under {gen.PIR_MIN_PRICE} gp skipped" in notes
    assert any(n.startswith("price_is_right: only 1 of 5") for n in notes)


# --- CLI -------------------------------------------------------------------------------


def test_cli_writes_validates_and_is_idempotent(tmp_path: Path) -> None:
    """The script output passes validate_packs.py; a second run is a no-op."""
    inputs = _write_inputs(tmp_path)
    out_dir = tmp_path / "packs"
    out = out_dir / "prices.json"
    args = [
        "--roster",
        str(inputs["roster"]),
        "--mapping-file",
        str(inputs["mapping"]),
        "--latest-file",
        str(inputs["latest"]),
        "--out",
        str(out),
        "--count",
        "12",
    ]
    first = _run_script(*args)
    assert first.returncode == 0, first.stderr
    assert (
        f"wrote {12 + PRICED} question(s) (12 more_less, {PRICED} price_is_right)" in first.stdout
    )
    assert "Barrows gloves" in first.stderr
    written = out.read_bytes()
    assert written.endswith(b"\n")

    validate = subprocess.run(
        [sys.executable, "scripts/validate_packs.py", str(out_dir)],
        cwd=SERVER_DIR,
        env={**os.environ, "PYTHONPATH": str(SERVER_DIR)},
        capture_output=True,
        text=True,
        check=False,
    )
    assert validate.returncode == 0, validate.stderr
    assert f"prices.json: {12 + PRICED} question(s) ok" in validate.stdout

    second = _run_script(*args)
    assert second.returncode == 0, second.stderr
    assert f"unchanged, {12 + PRICED} question(s)" in second.stdout
    assert out.read_bytes() == written


def test_cli_fails_on_roster_mismatch(tmp_path: Path) -> None:
    inputs = _write_inputs(tmp_path)
    roster = json.loads(inputs["roster"].read_text())
    roster["items"][0]["name"] = "Abyssal tentacle"
    inputs["roster"].write_text(json.dumps(roster))
    out = tmp_path / "prices.json"
    result = _run_script(
        "--roster",
        str(inputs["roster"]),
        "--mapping-file",
        str(inputs["mapping"]),
        "--latest-file",
        str(inputs["latest"]),
        "--out",
        str(out),
    )
    assert result.returncode == 1
    assert "FAILED: 1 roster problem(s)" in result.stderr
    assert not out.exists()


def test_cli_requires_both_saved_files(tmp_path: Path) -> None:
    result = _run_script("--mapping-file", str(tmp_path / "m.json"))
    assert result.returncode == 2
    assert "go together" in result.stderr


@pytest.fixture
def no_user_agent(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    """No ``WIKI_USER_AGENT`` in the environment or in ``.env``."""
    monkeypatch.delenv("WIKI_USER_AGENT", raising=False)
    monkeypatch.setattr(wiki, "ENV_FILE", tmp_path / "no.env")


@pytest.mark.usefixtures("no_user_agent")
def test_main_does_not_fetch_when_given_files_and_needs_no_user_agent(tmp_path: Path) -> None:
    inputs = _write_inputs(tmp_path)
    out = tmp_path / "prices.json"
    code = gen.main(
        [
            "--roster",
            str(inputs["roster"]),
            "--mapping-file",
            str(inputs["mapping"]),
            "--latest-file",
            str(inputs["latest"]),
            "--out",
            str(out),
            "--count",
            "5",
        ]
    )
    assert code == 0
    assert len(_mode(json.loads(out.read_text()), "more_less")) == 5


@pytest.mark.usefixtures("no_user_agent")
def test_a_network_run_without_a_user_agent_exits_before_its_first_request(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    inputs = _write_inputs(tmp_path)
    out = tmp_path / "prices.json"
    assert gen.main(["--roster", str(inputs["roster"]), "--out", str(out)]) == 1
    err = capsys.readouterr().err
    assert "WIKI_USER_AGENT is not set" in err
    assert wiki.EXAMPLE in err
    assert not out.exists()


def test_main_fetches_through_wiki_py_under_the_operators_user_agent(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """One request each to /mapping and /latest, both carrying ``WIKI_USER_AGENT``."""
    inputs = _write_inputs(tmp_path)
    monkeypatch.setenv("WIKI_USER_AGENT", "price-test - Zezima on Discord")
    calls: list[tuple[str, str]] = []

    def get_json(self: wiki.Wiki, url: str) -> Any:
        calls.append((url, self.user_agent))
        return MAPPING if url.endswith("/mapping") else LATEST

    monkeypatch.setattr(wiki.Wiki, "get_json", get_json)
    out = tmp_path / "prices.json"
    code = gen.main(["--roster", str(inputs["roster"]), "--out", str(out), "--count", "5"])
    assert code == 0
    assert calls == [
        (gen.API_BASE + "/mapping", "price-test - Zezima on Discord"),
        (gen.API_BASE + "/latest", "price-test - Zezima on Discord"),
    ]


# --- wiring ----------------------------------------------------------------------------


def test_generator_never_runs_at_startup_or_in_ci() -> None:
    """The script never runs at app startup or in CI."""
    ci = (REPO_ROOT / ".github" / "workflows" / "ci.yml").read_text()
    assert "gen_price" not in ci and "gen-price" not in ci
    makefile = (REPO_ROOT / "Makefile").read_text()
    assert "\ngen-price-questions:\n" in makefile
    for target in ("test:", "lint:", "dev:", "setup:", "validate-packs:"):
        line = next(ln for ln in makefile.splitlines() if ln.startswith(target))
        assert "gen-price-questions" not in line
    app_sources = "\n".join(p.read_text() for p in (SERVER_DIR / "app").rglob("*.py"))
    assert "gen_price_questions" not in app_sources
    dockerfile = (REPO_ROOT / "Dockerfile").read_text()
    assert "gen_price" not in dockerfile


def test_cli_price_is_right_count(tmp_path: Path) -> None:
    inputs = _write_inputs(tmp_path)
    out = tmp_path / "prices.json"
    common = ["--roster", str(inputs["roster"]), "--mapping-file", str(inputs["mapping"])]
    common += ["--latest-file", str(inputs["latest"]), "--out", str(out), "--count", "5"]
    result = _run_script(*common, "--price-is-right-count", "0")
    assert result.returncode == 0, result.stderr
    assert {q["mode"] for q in json.loads(out.read_text())["questions"]} == {"more_less"}
    result = _run_script(*common, "--price-is-right-count", "3")
    assert result.returncode == 0, result.stderr
    assert len(_mode(json.loads(out.read_text()), "price_is_right")) == 3
    refused = _run_script(*common, "--price-is-right-count", "-1")
    assert refused.returncode == 2
    assert "must not be negative" in refused.stderr
