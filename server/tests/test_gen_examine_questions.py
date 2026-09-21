"""T20 Accept, the generator half: an examine containing the item name is rejected with a
reason in the output summary; the summary says how many roster items were used and how
many rejected, and why; the allow list lets a named item past the name check and nothing
else. Run on saved-response fixtures; the network is never touched.

The fixture roster is real roster items, because the pack is checked against the shipped
``items`` vocabulary -- the one the server will check it against.
"""

import json
import sys
from pathlib import Path
from typing import Any

import pytest

from app.config import REPO_ROOT
from app.questions import schema
from app.questions.packs import pack_errors

sys.path.insert(0, str(REPO_ROOT / "server" / "scripts"))

import gen_examine_questions as gen  # noqa: E402
from gen_price_questions import RosterError  # noqa: E402

EXAMINES = {
    (4151, "Abyssal whip"): "A weapon from the abyss.",  # "abyss" is not "abyssal": fine
    (4587, "Dragon scimitar"): "A vicious, curved sword.",
    (1333, "Rune scimitar"): "A vicious, curved sword.",  # shared: two right answers
    (882, "Bronze arrow"): "Arrows with bronze heads.",  # a plural still gives it away
    (1965, "Cabbage"): "Yuck I don't like cabbage.",  # the whole name
    (6585, "Amulet of fury"): "A very powerful onyx amulet.",
    (20997, "Twisted bow"): "A mystical bow carved from the remains of the Great Olm.",
}
ROSTER = [{"id": item_id, "name": name} for item_id, name in [*EXAMINES, (7462, "Barrows gloves")]]
MAPPING = [
    *({"id": item_id, "name": name, "examine": text} for (item_id, name), text in EXAMINES.items()),
    {"id": 99999, "name": "Not in roster", "examine": "Nothing to see."},
]


def run(allowed: set[str] = frozenset()) -> tuple[dict[str, Any], gen.Result]:
    return gen.generate(ROSTER, MAPPING, set(allowed), "2026-09-21T00:00:00Z")


def reasons(result: gen.Result) -> dict[str, tuple[str, str]]:
    return {r.name: (r.reason, r.detail) for r in result.rejected}


# --- the rules --------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("name", "examine", "why"),
    [
        ("Abyssal whip", "An abyssal whip.", "contains the whole name"),
        ("Cabbage", "Yuck I don't like CABBAGE.", "contains the whole name"),
        ("Abyssal whip", "A whip from the abyss.", "contains 'whip' from the name"),
        ("Bronze arrow", "Arrows with bronze heads.", "contains 'bronze', 'arrow' from the name"),
        ("Dharok's greataxe", "Dharok the Wretched's axe.", "contains 'dharok' from the name"),
        ("Ēlysian spirit shield", "An elysian sigil.", "contains 'elysian' from the name"),
        ("Abyssal whip", "A sharp sword.", None),
        ("Abyssal whip", "A weapon from the abyss.", None),  # the examine word is shorter
        ("Rune 2h sword", "A two handed blade, 2h.", None),  # "2h" is three or fewer
        ("Ring of recoil", "Bring it on.", None),  # a word must start with it, not hold it
    ],
)
def test_giveaway(name: str, examine: str, why: str | None) -> None:
    assert gen.giveaway(name, examine) == why


def test_an_examine_containing_the_item_name_is_rejected_with_the_reason() -> None:
    """T20 Accept, on a fixture: rejected, and the reason is in the summary."""
    pack, result = run()
    got = reasons(result)
    assert got["Cabbage"] == (gen.GIVEAWAY, "contains the whole name")
    assert got["Bronze arrow"] == (gen.GIVEAWAY, "contains 'bronze', 'arrow' from the name")
    assert got["Amulet of fury"] == (gen.GIVEAWAY, "contains 'amulet' from the name")
    lines = gen.summary(result)
    assert '    Cabbage: "Yuck I don\'t like cabbage." (contains the whole name)' in lines
    assert all(q["payload"]["subject"]["name"] != "Cabbage" for q in pack["questions"])


def test_an_examine_two_roster_items_share_is_rejected_for_both() -> None:
    _, result = run()
    got = reasons(result)
    assert got["Dragon scimitar"] == (gen.SHARED, "also Rune scimitar")
    assert got["Rune scimitar"] == (gen.SHARED, "also Dragon scimitar")


def test_the_rest_are_one_question_each_answered_by_id_from_the_items_list() -> None:
    pack, result = run()
    assert [q["payload"] for q in pack["questions"]] == [
        {
            "prompt": "A weapon from the abyss.",
            "vocab": "items",
            "answer_id": 4151,
            "subject": {"name": "Abyssal whip", "asset": "item:4151"},
        },
        {
            "prompt": "A mystical bow carved from the remains of the Great Olm.",
            "vocab": "items",
            "answer_id": 20997,
            "subject": {"name": "Twisted bow", "asset": "item:20997"},
        },
    ]
    for q in pack["questions"]:
        assert (q["type"], q["mode"], q["tags"]) == ("pick_from_list", "guess_examine", ["examine"])
        assert q["id"] == schema.content_id(q)
    assert pack_errors(pack, "examine") == []
    assert result.skipped == ["Barrows gloves (7462): not in /mapping, so no examine"]


def test_the_summary_counts_used_and_rejected_and_the_rate_over_what_was_judged() -> None:
    """T20 Accept. The untradeable had no examine to judge, so it is not a rejection."""
    _, result = run()
    assert (len(result.questions), len(result.rejected), result.judged) == (2, 5, 7)
    lines = gen.summary(result)
    assert lines[0] == "7 roster item(s) with an examine: used 2, rejected 5 (71%)"
    assert "  rejected, examine shared with another roster item: 2" in lines
    assert "  rejected, examine gives the name away: 3" in lines
    assert "  skipped, nothing to judge: 1" in lines
    assert lines[-1].startswith("WARNING: over a third of the examines were rejected")


def test_a_run_under_a_third_does_not_warn() -> None:
    _, result = run({"Cabbage", "Bronze arrow", "Amulet of fury"})
    assert result.rejection_rate < gen.MAX_REJECTION_RATE
    assert not any(line.startswith("WARNING") for line in gen.summary(result))


# --- the allow list ---------------------------------------------------------------------


def test_the_allow_list_lets_a_named_item_past_the_name_check() -> None:
    pack, result = run({"Cabbage"})
    asked = {q["payload"]["subject"]["name"]: q["payload"]["prompt"] for q in pack["questions"]}
    assert asked["Cabbage"] == "Yuck I don't like cabbage."
    assert "Cabbage" not in reasons(result)
    assert result.allowed == ["Cabbage"]
    assert "  kept by the allow list despite the name check: 1 (Cabbage)" in gen.summary(result)


def test_the_allow_list_cannot_let_a_shared_examine_through() -> None:
    _, result = run({"Dragon scimitar"})
    assert reasons(result)["Dragon scimitar"][0] == gen.SHARED
    assert result.notes == [
        "allow list: Dragon scimitar is listed, but its examine is shared with Rune scimitar;"
        " the list cannot hold two right answers"
    ]


def test_an_allow_list_entry_that_is_not_needed_is_noted() -> None:
    _, result = run({"Abyssal whip"})
    assert result.notes == ["allow list: Abyssal whip passes the name check without it"]


def write(path: Path, value: Any) -> Path:
    path.write_text(json.dumps(value), encoding="utf-8")
    return path


def test_the_allow_list_is_by_name_and_refuses_one_not_on_the_roster(tmp_path: Path) -> None:
    ok = write(tmp_path / "ok.json", {"_comment": ["hi"], "names": ["Cabbage"]})
    assert gen.load_allowed(ok, ROSTER) == {"Cabbage"}
    assert gen.load_allowed(tmp_path / "absent.json", ROSTER) == set()
    by_id = write(tmp_path / "ids.json", {"names": [1965]})
    with pytest.raises(RosterError):
        gen.load_allowed(by_id, ROSTER)
    typo = write(tmp_path / "typo.json", {"names": ["cabbage", "Cabbage", "Cabbage"]})
    with pytest.raises(RosterError) as info:
        gen.load_allowed(typo, ROSTER)
    assert info.value.errors == [
        "typo.json: 'cabbage' is not a roster item name; names must match"
        " data/popular-items.json exactly",
        "typo.json: 'Cabbage' is listed more than once",
    ]


def test_the_shipped_allow_list_names_only_roster_items() -> None:
    roster = json.loads(gen.DEFAULT_ROSTER.read_text(encoding="utf-8"))["items"]
    names = json.loads(gen.DEFAULT_ALLOW.read_text(encoding="utf-8"))["names"]
    assert gen.load_allowed(gen.DEFAULT_ALLOW, roster) == set(names)
    assert names == sorted(names)


# --- inputs and the CLI -----------------------------------------------------------------


def test_a_roster_name_that_disagrees_with_mapping_is_an_error() -> None:
    roster = [{"id": 4151, "name": "Abyssal wipe"}]
    with pytest.raises(RosterError, match="calls this id 'Abyssal whip'"):
        gen.generate(roster, MAPPING, set(), "2026-09-21T00:00:00Z")


def test_the_cli_prints_the_summary_and_is_idempotent(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    roster = write(tmp_path / "roster.json", {"items": ROSTER})
    mapping = write(tmp_path / "mapping.json", MAPPING)
    allow = write(tmp_path / "allow.json", {"names": ["Cabbage"]})
    out = tmp_path / "packs" / "examine.json"
    argv = ["--roster", str(roster), "--allow", str(allow), "--mapping-file", str(mapping)]
    argv += ["--out", str(out)]

    assert gen.main(argv) == 0
    printed = capsys.readouterr().out
    assert "7 roster item(s) with an examine: used 3, rejected 4 (57%)" in printed
    assert "(contains 'bronze', 'arrow' from the name)" in printed
    assert "wrote 3 guess_examine question(s)" in printed
    first = out.read_text(encoding="utf-8")

    assert gen.main(argv) == 0
    assert "unchanged, 3 guess_examine question(s)" in capsys.readouterr().out
    assert out.read_text(encoding="utf-8") == first  # generated_at kept, not restamped


def test_the_cli_fails_on_a_bad_allow_list(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    roster = write(tmp_path / "roster.json", {"items": ROSTER})
    mapping = write(tmp_path / "mapping.json", MAPPING)
    allow = write(tmp_path / "allow.json", {"names": ["Dragon scimmy"]})
    out = tmp_path / "examine.json"
    argv = ["--roster", str(roster), "--allow", str(allow), "--mapping-file", str(mapping)]
    assert gen.main([*argv, "--out", str(out)]) == 1
    assert "'Dragon scimmy' is not a roster item name" in capsys.readouterr().err
    assert not out.exists()
