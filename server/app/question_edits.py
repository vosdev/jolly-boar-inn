"""The operator's pending edits and deletes of pack questions.

The packs live in git, so an edit made in ``/admin`` never touches the running server's.
It queues as a change keyed by the question's id in the packs as they are, leaves in an
export, and reaches the packs through ``scripts/edit_packs.py`` and a release, the way
suggestions do. A second change to one question replaces the first.

Only the payload, the ``difficulty`` and the fields an author checks it by (``wiki``,
``source_url``) and credits it with (``credit``, ``credit_shown``) are edited. The type,
the mode, the NPC who asks it and its tags stay as the packs have them, so an edit is
checked as the question it will be: schema, type, mode and NPC, with its id recomputed.
The packs' own rules across questions (a duplicate id, one examine line under two answers)
are checked again when the export is applied.

The price modes are left out: their pack is generated from the roster, and the next
``make gen-price-questions`` would overwrite an edit to it.
"""

from collections.abc import Iterable
from typing import Any

import asyncpg

from app.errors import ApiError
from app.questions import schema, text
from app.questions.packs import Pack, mode_questions
from app.reports import ITEM_MODES, pack_modes
from app.rooms.models import CREDIT_MAX, normalize_name
from app.suggestions import NO_DIFFICULTY_MODES, NO_EXPLANATION_MODES, difficulty_errors

EDITABLE = ("payload", "difficulty", "wiki", "source_url", "credit", "credit_shown")


class BadEdit(ApiError):
    status, code = 422, "bad_edit"


class QuestionNotFound(ApiError):
    status, code = 404, "not_found"


def edit_modes() -> list[str]:
    """The modes whose pack questions the editor lists: every hand-written one."""
    return [mode for mode in pack_modes() if mode not in ITEM_MODES]


def find(packs: Iterable[Pack], question_id: str) -> dict[str, Any]:
    """The pack question with ``question_id`` in a mode the editor lists, or a 404."""
    for mode in edit_modes():
        for question in mode_questions(packs, mode):
            if question["id"] == question_id:
                return question
    raise QuestionNotFound(f"{question_id!r} is not a pack question the editor lists")


def edited(packs: list[Pack], before: dict[str, Any], body: dict[str, Any]) -> dict[str, Any]:
    """``before`` with the edited fields of ``body``, its id recomputed, or ``BadEdit``."""
    found = text.errors(body)
    if found:
        raise BadEdit("; ".join(found))
    after = {key: value for key, value in before.items() if key not in EDITABLE}
    after |= {key: body[key] for key in EDITABLE if key in body}
    if isinstance(after.get("credit"), str):
        after["credit"] = normalize_name(after["credit"], CREDIT_MAX)
    if isinstance(after.get("payload"), dict):
        after["id"] = schema.content_id(after)
    found = schema.errors(after)
    if found:
        raise BadEdit("; ".join(found))
    if after["mode"] in NO_EXPLANATION_MODES and "explanation" in after["payload"]:
        raise BadEdit(f"$.payload.explanation: {after['mode']!r} shows no explanation")
    if "difficulty" in after:
        found = difficulty_errors(after["mode"], after["difficulty"])
        if found:
            raise BadEdit("; ".join(found))
    elif after["mode"] not in NO_DIFFICULTY_MODES:
        raise BadEdit("$.difficulty: required, since every round's question keeps a tier")
    if after == before:
        raise BadEdit("the edit changes nothing")
    if after["id"] != before["id"] and any(
        question["id"] == after["id"] for pack in packs for question in pack.questions
    ):
        raise BadEdit(f"$.payload: the edit is the same question as {after['id']}")
    return after


# --- storage --------------------------------------------------------------------------

_COLUMNS = "question_id, mode, action, question, before, updated_at, exported_at"


def view(row: asyncpg.Record, packs: Iterable[Pack]) -> dict[str, Any]:
    """One change as the admin page gets it, and whether its question is still in the packs."""
    ids = {question["id"] for pack in packs for question in pack.questions}
    return dict(row) | {"in_packs": row["question_id"] in ids}


async def _save(
    pool: asyncpg.Pool,
    before: dict[str, Any],
    action: str,
    question: dict[str, Any] | None,
) -> asyncpg.Record:
    if question is not None:
        clash = await pool.fetchval(
            "select question_id from question_edits"
            " where question->>'id' = $1 and question_id <> $2",
            question["id"],
            before["id"],
        )
        if clash is not None:
            raise BadEdit(f"$.payload: the pending edit of {clash} is the same question")
    return await pool.fetchrow(
        "insert into question_edits (question_id, mode, action, question, before)"
        " values ($1, $2, $3, $4, $5)"
        " on conflict (question_id) do update set action = excluded.action,"
        " question = excluded.question, updated_at = now(), exported_at = null"
        f" returning {_COLUMNS}",
        before["id"],
        before["mode"],
        action,
        question,
        before,
    )


async def edit(
    pool: asyncpg.Pool, packs: list[Pack], question_id: str, body: dict[str, Any]
) -> dict[str, Any]:
    """Queue an edit of a pack question, replacing any change already queued for it."""
    before = find(packs, question_id)
    return view(await _save(pool, before, "edit", edited(packs, before, body)), packs)


async def delete(pool: asyncpg.Pool, packs: list[Pack], question_id: str) -> dict[str, Any]:
    """Queue the removal of a pack question, replacing any change already queued for it."""
    return view(await _save(pool, find(packs, question_id), "delete", None), packs)


async def listing(pool: asyncpg.Pool, packs: list[Pack]) -> dict[str, Any]:
    """Every queued change, oldest first."""
    rows = await pool.fetch(
        f"select {_COLUMNS} from question_edits order by updated_at, question_id"
    )
    return {"changes": [view(row, packs) for row in rows]}


async def discard(pool: asyncpg.Pool, question_id: str) -> None:
    """Drop the change queued for a question."""
    done = await pool.fetchval(
        "delete from question_edits where question_id = $1 returning question_id", question_id
    )
    if done is None:
        raise QuestionNotFound("no change is queued for that question")


def export_file(rows: Iterable[asyncpg.Record]) -> dict[str, Any]:
    """The file ``make edit-packs`` reads: edits by the id they replace, and deleted ids."""
    out: dict[str, Any] = {"edits": [], "deletes": []}
    for row in rows:
        if row["action"] == "edit":
            question = {k: v for k, v in row["question"].items() if k != "random_event"}
            out["edits"].append({"id": row["question_id"], "question": question})
        else:
            out["deletes"].append(row["question_id"])
    return out


async def export(pool: asyncpg.Pool) -> dict[str, Any]:
    """Every queued change, marked exported."""
    rows = await pool.fetch(f"update question_edits set exported_at = now() returning {_COLUMNS}")
    return export_file(sorted(rows, key=lambda row: (row["updated_at"], row["question_id"])))


async def mark_applied(pool: asyncpg.Pool) -> int:
    """Drop the changes the last export downloaded, now that git holds them; how many."""
    done = await pool.fetch(
        "delete from question_edits where exported_at is not null returning question_id"
    )
    return len(done)
