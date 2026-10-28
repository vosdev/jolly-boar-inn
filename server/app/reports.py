"""What players report wrong with a pack question, and the operator's queue of it.

A player who has finished a game picks a mode, then a question of it, and says what is
wrong: a wrong answer, a typo, an outdated fact. The owner fixes the pack in git.

The price modes are the exception. Their packs are generated from the roster
(``data/popular-items.json``) and the day's prices, so a player reports an item from the
roster rather than one of the day's questions. "Something else" reports no question.

A question's id is a hash of its content, so fixing it changes the id. A report keeps a
snapshot of what it was filed against: the whole question, or the item ``{id, name}``.
The id only links to the pack while it still matches.

``choices`` is what the report form and ``/suggest`` search, named by what players read
while a question is open. Odd One Out's questions all ask the same thing, so their label
is the options in pack order, which says which question it is but not which option is
the odd one. Who's That NPC? and Pixel Hunt ask the same too, and the picture is the
question, so a list pick's label is the name it answers to: the one answer a label gives.
"""

from collections.abc import Collection
from typing import Any, Literal
from uuid import UUID

import asyncpg

from app.errors import ApiError
from app.modes import MODES, offered
from app.questions import text, vocab
from app.questions.packs import EVENT_MODE, Pack, mode_questions

Status = Literal["open", "closed"]

TEXT_MAX = 500
ITEM_MODES = frozenset({"more_less", "price_is_right"})
ITEM_VOCAB = "items"
NPC_MODE = "whos_that_npc"
# Its prompt is the same for every question; the options are what tell them apart.
OPTIONS_LABEL_MODES = frozenset({"odd_one_out"})


class BadReport(ApiError):
    status, code = 422, "bad_report"


class BadMode(ApiError):
    status, code = 422, "bad_mode"


class ReportNotFound(ApiError):
    status, code = 404, "not_found"


def pack_modes() -> list[str]:
    """Every mode with pack questions of its own, in registry order."""
    return [
        mode.id
        for mode in MODES.values()
        if (mode.is_round and mode.pool is None) or mode.id == EVENT_MODE
    ]


def report_modes(settings: Any, packs: list[Pack], pictures: Collection[str]) -> list[str]:
    """The pack modes this instance plays, which a player may report from."""
    on = {mode.id for mode in offered(settings, packs, pictures)}
    return [mode for mode in pack_modes() if mode in on]


def label(question: dict[str, Any]) -> str:
    """How the form names a question: what players read while it is open, never its answer."""
    payload = question["payload"]
    if question["mode"] in OPTIONS_LABEL_MODES:
        return ", ".join(payload["options"])
    if question["mode"] == NPC_MODE and question["type"] == "multiple_choice":
        return payload["options"][payload["answer_index"]]
    if question["type"] == "pick_from_list" and "image" in payload:
        names = vocab.get(payload["vocab"])
        name = names.name_of(payload["answer_id"]) if names else None
        if name is not None:
            return name
    quote = payload.get("quote")
    return payload["prompt"] if quote is None else f"{payload['prompt']} “{quote}”"


def choices(packs: list[Pack], mode: str) -> dict[str, Any]:
    """What the form offers for ``mode``: the roster's items, or the pack's questions."""
    if mode in ITEM_MODES:
        roster = vocab.get(ITEM_VOCAB)
        entries = roster.entries if roster else ()
        return {"by": "item", "choices": [{"id": e.id, "label": e.name} for e in entries]}
    return {"by": "question", "choices": [_choice(q) for q in mode_questions(packs, mode)]}


def _choice(question: dict[str, Any]) -> dict[str, Any]:
    # A shadow's NPC id lets /suggest refuse one the list already has; a render's NPC is
    # on no list. A random event's asker is no secret: players see who asks it first.
    choice = {"id": question["id"], "label": label(question)}
    if question["mode"] == NPC_MODE and question["type"] == "pick_from_list":
        choice["npc"] = question["payload"]["answer_id"]
    if question["mode"] == EVENT_MODE:
        choice["random_event"] = question["random_event"]
    return choice


def _snapshot(
    packs: list[Pack], mode: str, question: str | None, item: int | None
) -> dict[str, Any] | None:
    if mode in ITEM_MODES:
        if question is not None:
            raise BadReport(f"$.question: {mode!r} is reported by item, not by question")
        if item is None:
            return None
        roster = vocab.get(ITEM_VOCAB)
        found = next((e for e in roster.entries if e.id == item), None) if roster else None
        if found is None:
            raise BadReport(f"$.item: {item} is not on the roster")
        return {"id": found.id, "name": found.name}
    if item is not None:
        raise BadReport(f"$.item: {mode!r} is reported by question, not by item")
    if question is None:
        return None
    found = next((q for q in mode_questions(packs, mode) if q["id"] == question), None)
    if found is None:
        raise BadReport(f"$.question: {question!r} is not in {mode!r}'s pack")
    return found


def _text(value: str) -> str:
    if text.errors(value):
        raise BadReport("$.text: holds a character that cannot be stored")
    tidy = value.replace("\r\n", "\n").strip()
    if any(ch != "\n" and (ch < " " or "\x7f" <= ch <= "\x9f") for ch in tidy):
        raise BadReport("$.text: control characters other than a line break")
    if not 1 <= len(tidy) <= TEXT_MAX:
        raise BadReport(f"$.text: 1 to {TEXT_MAX} characters")
    return tidy


def check(
    packs: list[Pack],
    settings: Any,
    pictures: Collection[str],
    mode: str,
    question: str | None,
    item: int | None,
    body: str,
) -> tuple[dict[str, Any] | None, str]:
    """The snapshot and the tidied text of a report, or ``BadReport`` naming the problem."""
    if mode not in report_modes(settings, packs, pictures):
        raise BadReport(f"$.mode: {mode!r} takes no reports")
    return _snapshot(packs, mode, question, item), _text(body)


# --- storage --------------------------------------------------------------------------

_COLUMNS = "id, mode, question_id, snapshot, text, status, created_at"


def view(row: asyncpg.Record) -> dict[str, Any]:
    """One row as the admin page gets it."""
    return dict(row)


async def add(
    pool: asyncpg.Pool, mode: str, question: str | None, snapshot: dict[str, Any] | None, body: str
) -> UUID:
    """Store a checked report as open; its id."""
    return await pool.fetchval(
        "insert into reports (mode, question_id, snapshot, text)"
        " values ($1, $2, $3, $4) returning id",
        mode,
        question,
        snapshot,
        body,
    )


async def listing(pool: asyncpg.Pool, status: Status) -> dict[str, Any]:
    """The reports with ``status``, oldest first, and how many each status holds."""
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            f"select {_COLUMNS} from reports where status = $1 order by created_at, id", status
        )
        counts = await conn.fetch("select status, count(*)::int as n from reports group by status")
    totals = {"open": 0, "closed": 0}
    totals.update({row["status"]: row["n"] for row in counts})
    return {"reports": [view(row) for row in rows], "counts": totals}


async def set_status(pool: asyncpg.Pool, report: UUID, status: Status) -> dict[str, Any]:
    """Close a report, or reopen a closed one. Closed reports are kept."""
    row = await pool.fetchrow(
        f"update reports set status = $2 where id = $1 returning {_COLUMNS}", report, status
    )
    if row is None:
        raise ReportNotFound("no such report")
    return view(row)
