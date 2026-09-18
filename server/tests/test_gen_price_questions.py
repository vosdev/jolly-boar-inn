"""T5 Accept: the generator produces about 100 valid questions, ``validate_packs.py``
passes on the output, the script is idempotent, and nothing runs it at app startup or in
CI. The generator is exercised on saved-response fixtures; the network is never touched.
"""

import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any

import pytest

from app.config import REPO_ROOT
from app.questions import schema
from app.questions.packs import load_packs, pack_errors

SERVER_DIR = REPO_ROOT / "server"
PACKS_DIR = REPO_ROOT / "data" / "packs"
sys.path.insert(0, str(SERVER_DIR / "scripts"))

import gen_price_questions as gen  # noqa: E402

# A ladder of 12 tradeables 12% apart: neighbours and next-but-one neighbours are within
# 30% of each other (21 pairs per metric), anything further apart is not. Plus an isolated
# expensive item, an untradeable, and a bond with a price but no high alch.
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
GE_PAIRS = 21 + 1  # ladder pairs, plus the bond (1060 gp) with Ladder 02 (1254 gp)
HIGH_ALCH_PAIRS = 21


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


def _ratio(question: dict[str, Any]) -> float:
    payload = question["payload"]
    lo, hi = sorted((payload["anchor"]["value"], payload["target"]["value"]))
    return hi / lo


def _names(pack: dict[str, Any]) -> set[tuple[str, str]]:
    return {
        (q["payload"]["metric"], side["subject"]["name"])
        for q in pack["questions"]
        for side in (q["payload"]["anchor"], q["payload"]["target"])
    }


@pytest.fixture(autouse=True)
def no_network(monkeypatch: pytest.MonkeyPatch) -> None:
    def refuse(*args: Any, **kwargs: Any) -> None:
        raise AssertionError("tests must not touch the network")

    monkeypatch.setattr(gen.urllib.request, "urlopen", refuse)


# --- shipped pack ----------------------------------------------------------------------


def test_shipped_prices_pack_has_about_100_valid_questions() -> None:
    """T5: produces about 100 valid questions; validate_packs.py passes on the output."""
    packs = load_packs(PACKS_DIR)
    prices = next(pack for pack in packs if pack.path.name == "prices.json")
    assert prices.name == gen.PACK_NAME
    assert 90 <= len(prices.questions) <= 110
    metrics = {q["payload"]["metric"] for q in prices.questions}
    assert metrics == set(gen.METRIC_SHARE)
    for q in prices.questions:
        assert q["type"] == "higher_lower"
        assert q["source"] == "pack"
        assert "prices" in q["tags"]
        assert q["id"] == schema.content_id(q)
        assert gen.MIN_RATIO <= _ratio(q) <= gen.MAX_RATIO, q["id"]


# --- generate() ------------------------------------------------------------------------


def test_generate_is_valid_and_deterministic() -> None:
    """T5: idempotent, given the same inputs the output is identical."""
    pack, notes = gen.generate(ROSTER, MAPPING, LATEST, count=10)
    again, _ = gen.generate(ROSTER, MAPPING, LATEST, count=10)
    assert gen.render(pack) == gen.render(again)
    assert pack_errors(pack, "prices") == []
    assert pack["pack"] == "prices"
    assert pack["generated_at"] == NEWEST
    assert len(pack["questions"]) == 10
    assert [q["payload"]["metric"] for q in pack["questions"]].count("ge_price") == 7
    assert notes == [] or all("skip" in n or "no highalch" in n for n in notes)
    for q in pack["questions"]:
        assert q["payload"]["as_of"] == "2026-09-18"
        assert q["difficulty"] in ("easy", "medium", "hard")
        assert q["tags"] == gen.TAGS[q["payload"]["metric"]]


def test_generate_only_pairs_items_of_similar_value() -> None:
    """Every question compares values within 30% of each other, and not a coin flip."""
    pack, _ = gen.generate(ROSTER, MAPPING, LATEST, count=GE_PAIRS + HIGH_ALCH_PAIRS)
    assert len(pack["questions"]) == GE_PAIRS + HIGH_ALCH_PAIRS
    for q in pack["questions"]:
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
    """70/30 wants 28 ge_price of 40, only 22 exist: high_alch fills the gap."""
    pack, notes = gen.generate(ROSTER, MAPPING, LATEST, count=40)
    metrics = [q["payload"]["metric"] for q in pack["questions"]]
    assert metrics.count("ge_price") == GE_PAIRS
    assert metrics.count("high_alch") == 40 - GE_PAIRS
    assert any(n.startswith("ge_price: 22 pair(s) within 30%") and "using 22" in n for n in notes)
    assert any(n.startswith("high_alch: 21 pair(s)") and "using 18" in n for n in notes)
    assert not any("questions possible" in n for n in notes)


def test_generate_seed_changes_selection() -> None:
    a, _ = gen.generate(ROSTER, MAPPING, LATEST, count=10, seed=1)
    b, _ = gen.generate(ROSTER, MAPPING, LATEST, count=10, seed=2)
    assert [q["id"] for q in a["questions"]] != [q["id"] for q in b["questions"]]


def test_generate_reports_shortfall_without_failing() -> None:
    pack, notes = gen.generate(ROSTER, MAPPING, LATEST, count=1000)
    assert len(pack["questions"]) == GE_PAIRS + HIGH_ALCH_PAIRS
    assert any(n.startswith("only 43 of 1000 questions possible") for n in notes)
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
    assert (by_name["Ladder 00"], by_name["Ladder 01"]) in pairs  # 12% apart
    assert (by_name["Ladder 00"], by_name["Ladder 02"]) in pairs  # 25% apart
    assert (by_name["Ladder 00"], by_name["Ladder 03"]) not in pairs  # 40% apart
    assert (by_name["Ladder 00"], by_name["Old school bond"]) not in pairs  # 6%: coin flip
    assert (by_name["Ladder 02"], by_name["Old school bond"]) in pairs  # 18% apart
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
    [(100, 123, "easy"), (123, 100, "easy"), (100, 117, "medium"), (100, 116, "hard")],
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


def test_make_question_matches_higher_lower_contract() -> None:
    whip = gen.Item(4151, "Abyssal whip", 1650000, 72000)
    scim = gen.Item(4587, "Dragon scimitar", 60000, 60000)
    q = gen.make_question("ge_price", whip, scim, "2026-09-01")
    schema.validate(q)
    assert q["payload"]["answer"] == "lower"
    assert q["payload"]["anchor"]["subject"] == {"name": "Abyssal whip", "asset": "item:4151"}
    assert gen.make_question("high_alch", scim, whip, "2026-09-01")["payload"]["answer"] == (
        "higher"
    )


# --- CLI -------------------------------------------------------------------------------


def test_cli_writes_validates_and_is_idempotent(tmp_path: Path) -> None:
    """T5: the script output passes validate_packs.py; a second run is a no-op."""
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
    assert "wrote 12 question(s)" in first.stdout
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
    assert "prices.json: 12 question(s) ok" in validate.stdout

    second = _run_script(*args)
    assert second.returncode == 0, second.stderr
    assert "unchanged, 12 question(s)" in second.stdout
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


def test_main_does_not_fetch_when_given_files(tmp_path: Path) -> None:
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
    assert len(json.loads(out.read_text())["questions"]) == 5


def test_main_uses_the_api_with_a_descriptive_user_agent(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """One request each to /mapping and /latest, both carrying the User-Agent."""
    inputs = _write_inputs(tmp_path)
    calls: list[tuple[str, str]] = []

    def fake_fetch(url: str, user_agent: str) -> Any:
        calls.append((url, user_agent))
        return MAPPING if url.endswith("/mapping") else LATEST

    monkeypatch.setattr(gen, "fetch_json", fake_fetch)
    out = tmp_path / "prices.json"
    code = gen.main(["--roster", str(inputs["roster"]), "--out", str(out), "--count", "5"])
    assert code == 0
    assert calls == [
        (gen.API_BASE + "/mapping", gen.USER_AGENT),
        (gen.API_BASE + "/latest", gen.USER_AGENT),
    ]
    assert "jolly-boar-inn" in gen.USER_AGENT and "github.com" in gen.USER_AGENT


# --- wiring ----------------------------------------------------------------------------


def test_generator_never_runs_at_startup_or_in_ci() -> None:
    """T5: the script never runs at app startup or in CI."""
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
