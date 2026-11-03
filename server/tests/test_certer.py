"""Certer: a random event asking Pixel Hunt's items, always sketched, scored on the build-up."""

import json
import random
import sys
from collections import Counter
from datetime import date
from pathlib import Path
from typing import Any
from uuid import uuid4

from app.config import REPO_ROOT
from app.daily import draw
from app.modes import MODES, drawable, steps_of
from app.questions.packs import EVENT_MODE, Pack, load_packs
from app.questions.schema import event_errors
from app.questions.types.scoring import Scoring
from app.random_events import BUILT_UP, RANDOM_EVENTS
from app.rooms.models import RoomQuestion
from app.rooms.selection import HOST_FACES, select
from app.rooms.settings import RoomSettings
from tests.packs import PACKS_DIR
from tests.test_daily import varied

sys.path.insert(0, str(REPO_ROOT / "server" / "scripts"))

import gen_pixel_hunt  # noqa: E402
import validate_packs  # noqa: E402
from fetch_assets import MANIFEST, load_manifest  # noqa: E402

FILE = REPO_ROOT / "data" / "packs" / "random_events" / "certer.json"
DAY = date(2026, 12, 1)


def roster() -> list[dict[str, Any]]:
    path = REPO_ROOT / "data" / "popular-items.json"
    return json.loads(path.read_text(encoding="utf-8"))["items"]


def certer(n: int) -> dict[str, Any]:
    payload = {"prompt": "What is this item?", "vocab": "items", "answer_id": n}
    return {
        "id": f"c{n}",
        "mode": EVENT_MODE,
        "type": "pick_from_list",
        "random_event": "certer",
        "payload": {**payload, "image": f"item:{n}"},
    }


def npc(ident: str, who: str) -> dict[str, Any]:
    return {
        "id": ident,
        "mode": EVENT_MODE,
        "type": "multiple_choice",
        "random_event": who,
        "payload": {},
    }


def test_certer_is_on_the_roster_and_builds_up_as_pixel_hunt_does() -> None:
    assert "certer" in RANDOM_EVENTS
    assert BUILT_UP == {"certer": MODES["pixel_hunt"].steps}


def test_the_file_is_what_the_script_writes_from_the_roster() -> None:
    pack = gen_pixel_hunt.generate_certer(roster(), load_manifest(MANIFEST))
    assert gen_pixel_hunt.render(pack) == FILE.read_text(encoding="utf-8")


def test_certer_asks_pixel_hunts_items_under_ids_of_his_own() -> None:
    packs = load_packs(PACKS_DIR)
    hunt = [q for p in packs for q in p.questions if q["mode"] == "pixel_hunt"]
    asked = [q for p in packs for q in p.questions if q.get("random_event") == "certer"]
    assert [q["payload"]["answer_id"] for q in asked] == [q["payload"]["answer_id"] for q in hunt]
    assert not {q["id"] for q in asked} & {q["id"] for q in hunt}
    for question in asked:
        payload = question["payload"]
        assert question["type"] == "pick_from_list"
        assert payload["image"] == f"item:{payload['answer_id']}"
        assert payload["intro"] in gen_pixel_hunt.CERTER_INTROS


def test_every_intro_fits() -> None:
    assert all(len(intro) <= 150 for intro in gen_pixel_hunt.CERTER_INTROS)


def test_validate_packs_fails_a_certer_question_that_pictures_another_item() -> None:
    question = {**certer(4151), "payload": {**certer(4151)["payload"], "image": "item:4587"}}
    pack = Pack("random_events", None, (question,), Path("certer.json"), random_event="certer")
    (error,) = validate_packs.picture_errors([pack], {"items/4151.png": "Abyssal whip.png"})
    assert error.endswith("must picture its own item")


def test_a_certer_question_is_drawn_only_with_its_picture() -> None:
    assert not drawable(certer(4151), ())
    assert drawable(certer(4151), {"item:4151"})
    assert drawable(npc("n", "reldo"), ())


def test_certer_scores_on_the_build_up_wherever_he_asks() -> None:
    for mode in (EVENT_MODE, "random_events_only"):
        assert steps_of(mode, "certer") == BUILT_UP["certer"]
        question = RoomQuestion(
            id=uuid4(),
            position=0,
            content_id="c1",
            type="pick_from_list",
            mode=mode,
            source="pack",
            payload=certer(1)["payload"],
            host_only=False,
            author_player_id=None,
            random_event="certer",
        )
        assert question.scoring is Scoring.STEP
    assert steps_of(EVENT_MODE, "reldo") is None


def _events(certers: int = 100) -> list[dict[str, Any]]:
    others = [npc(f"{who}{n}", who) for who in RANDOM_EVENTS[:5] for n in range(2)]
    return [certer(n) for n in range(certers)] + others


def test_random_events_only_draws_an_npc_before_a_question() -> None:
    """By question, Certer's hundred would ask nearly the whole round."""
    pack = Pack("random_events", None, tuple(_events()), Path("e.json"))
    pictures = {f"item:{n}" for n in range(100)}
    settings = RoomSettings(
        modes=[{"mode": "random_events_only", "questions": 6}], random_event_frequency="less"
    )
    asked = Counter()
    for seed in range(40):
        (round_,) = select([pack], [], settings, random.Random(seed), pictures)
        asked.update(q["random_event"] for q in round_.questions)
    assert asked["certer"] / asked.total() < 0.35


def test_the_daily_draws_an_npc_before_a_question() -> None:
    rounds = varied(60)
    asked = Counter()
    for seed in range(40):
        found = draw(rounds + _events(), {}, DAY, random.Random(seed))
        assert found is not None
        asked.update(q["random_event"] for q in found if q["mode"] == EVENT_MODE)
    assert asked["certer"] / asked.total() < 0.5


def test_certer_asks_no_host_question() -> None:
    question = {
        "type": "free_text",
        "mode": "custom",
        "random_event": "certer",
        "payload": {"prompt": "Who?", "accepted": ["Me"]},
    }
    (error,) = event_errors(question)
    assert "'certer' asks only for a picture" in error
    assert event_errors({**question, "random_event": "reldo"}) == []


def test_a_host_question_left_to_the_draw_never_gets_certer() -> None:
    assert "certer" not in HOST_FACES
    assert set(HOST_FACES) == set(RANDOM_EVENTS) - {"certer"}
