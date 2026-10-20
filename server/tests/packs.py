"""The packs directory the tests play from: the shipped packs, plus a price pack made offline.

Each instance generates its own ``prices.json`` from live prices and git ignores it, so the
tests generate theirs from made-up prices for the real roster: full size, every metric and
direction, and the same on every machine whatever the checkout holds.
"""

import atexit
import shutil
import sys
import tempfile
from pathlib import Path

from app.config import REPO_ROOT

sys.path.insert(0, str(REPO_ROOT / "server" / "scripts"))

import gen_price_questions as gen  # noqa: E402

# 2026-09-18T22:47:24Z, so every pack question is as of one fixed day.
TRADED = 1789771644
# Neighbours 7% apart: each item has a dozen or more partners in the 1.25x..4x window.
STEP = 1.07


def _build() -> Path:
    directory = Path(tempfile.mkdtemp(prefix="jbi-packs-"))
    atexit.register(shutil.rmtree, directory, ignore_errors=True)
    packs = directory / "packs"
    shutil.copytree(
        REPO_ROOT / "data" / "packs", packs, ignore=shutil.ignore_patterns("prices.json")
    )
    roster = gen.load_roster(gen.DEFAULT_ROSTER)
    prices = {item["id"]: round(100 * STEP**k) for k, item in enumerate(roster)}
    mapping = [
        {"id": item["id"], "name": item["name"], "highalch": prices[item["id"]] * 3 // 5}
        for item in roster
    ]
    latest = {
        "data": {
            str(item_id): {"high": price, "highTime": TRADED, "low": price, "lowTime": TRADED}
            for item_id, price in prices.items()
        }
    }
    pack, _ = gen.generate(roster, mapping, latest)
    (packs / "prices.json").write_text(gen.render(pack), encoding="utf-8")
    return packs


PACKS_DIR = _build()
