"""What players suggest for the packs, and the operator's queue of it.

A player who has finished a game may suggest one of two kinds of content:

- ``question``: a question for a mode, in the shape Create's editor writes it, plus the
  mode it is for and where it was checked: the wiki page, an https ``source_url`` for what
  the wiki cannot prove, or both. A round not built yet takes them too, so its pack is
  ready when it opens; such a suggestion waits in the queue until it is.
- ``item``: an item name for the roster (``data/popular-items.json``) that is not on it yet.
  The import script finds its id, so a player needs to know no more than the name.

Every suggestion carries a ``credit``, a name held to a display name's rules, and whether
players may see it. An item's is kept but never shown: the rounds it feeds have no reveal
that names a question's author. Nothing here plays: an approved suggestion reaches a game
only through an export, ``scripts/import_suggestions.py`` and a release, so packs stay in git.

Validation is the packs' own wherever a pack question results: the schema, the type's
``check`` and, for a built mode, the mode and NPC rules. Content the server stores goes
back out only to the operator, and the client draws it as text.
"""

from collections.abc import Sequence
from typing import Any, Literal
from uuid import UUID

import asyncpg

from app.errors import ApiError
from app.modes import MODES
from app.questions import schema, text, vocab
from app.questions.types import TYPES

Kind = Literal["question", "item"]
Status = Literal["pending", "approved", "rejected", "imported"]

_CHOICE = frozenset({"multiple_choice"})
# The modes a player may write a question for, and the types its editor offers. An NPC's
# question is any type a host may write; the rounds still to be built are all four buttons.
QUESTION_MODES: dict[str, frozenset[str]] = {
    "random_event": frozenset(
        {"multiple_choice", "free_text", "closest_number", "pick_all_that_apply"}
    ),
    "bestiary": frozenset({"multiple_choice", "free_text", "pick_all_that_apply", "ordering"}),
    "drop_table": frozenset(
        {"multiple_choice", "free_text", "closest_number", "pick_all_that_apply"}
    ),
    "guess_examine": _CHOICE,
    "odd_one_out": _CHOICE,
    "who_said_that": _CHOICE,
    "know_your_content_creator": frozenset(
        {"multiple_choice", "closest_number", "pick_all_that_apply"}
    ),
    "sort_it_out": frozenset({"ordering"}),
    "release_order": frozenset({"ordering"}),
}

# The rounds that show a quotation under the prompt (``multiple_choice.quote``).
QUOTE_MODES = frozenset({"who_said_that", "know_your_content_creator"})

# Rounds whose questions all ask the same thing: the pack's tests hold them to it.
FIXED_PROMPTS = {"odd_one_out": "Which one doesn't belong?"}

# The intro is an NPC's line before the question, so only an NPC's question takes one.
INTRO_MODES = frozenset({"random_event"})

# Pack questions' tags, which a suggestion is not asked for.
MODE_TAGS = {"guess_examine": ["examine"]}
# Rounds whose pack holds every question to the wiki page its author checked.
WIKI_MODES = frozenset({"guess_examine"})
# The longest item names on the wiki are about 50 characters.
ITEM_NAME_MAX = 80

_QUESTION_KEYS = {"type", "payload", "mode"}
_QUESTION_OPTIONAL = frozenset({"random_event", "wiki", "source_url"})
_ITEM_KEYS = {"name"}


class BadSuggestion(ApiError):
    status, code = 422, "bad_suggestion"


class SuggestionNotFound(ApiError):
    status, code = 404, "not_found"


def playable(kind: str, content: dict[str, Any]) -> bool:
    """Whether the import script can place it now: false for a round not built yet."""
    return kind != "question" or content.get("mode") in MODES


def question_envelope(content: dict[str, Any]) -> dict[str, Any]:
    """A question suggestion as the pack question it would become, NPC stamped as a file would."""
    envelope = {
        "type": content["type"],
        "mode": content["mode"],
        "source": "pack",
        "tags": MODE_TAGS.get(content["mode"], []),
        "payload": content["payload"],
    }
    for key in ("wiki", "source_url", "random_event"):
        if key in content:
            envelope[key] = content[key]
    return {"id": schema.content_id(envelope), **envelope}


def _keys(
    content: dict[str, Any], required: set[str], optional: frozenset[str] = frozenset()
) -> list[str]:
    missing = [f"$.{key}: required" for key in sorted(required - content.keys())]
    extra = [
        f"$.{key}: not part of this suggestion"
        for key in sorted(content.keys() - required - optional)
    ]
    return missing + extra


def _question_errors(content: dict[str, Any]) -> list[str]:
    found = _keys(content, _QUESTION_KEYS, _QUESTION_OPTIONAL)
    if found:
        return found
    if not {"wiki", "source_url"} & content.keys():
        return ["$.wiki: a wiki page, or $.source_url: another https link, to check it against"]
    mode = content["mode"]
    if mode in WIKI_MODES and "wiki" not in content:
        return [f"$.wiki: required, since {mode!r} is checked against the wiki"]
    types = QUESTION_MODES.get(mode)
    if types is None:
        return [f"$.mode: {mode!r} takes no suggestions (it takes {', '.join(QUESTION_MODES)})"]
    if content["type"] not in types:
        return [f"$.type: {content['type']!r} is not offered for {mode!r}"]
    if (mode == "random_event") != ("random_event" in content):
        return ["$.random_event: an NPC's question names its NPC, and only it does"]
    links = [content[key] for key in ("wiki", "source_url") if key in content]
    if not isinstance(content["payload"], dict) or not all(isinstance(url, str) for url in links):
        return ["$.payload: an object, and $.wiki and $.source_url: links"]
    if "quote" in content["payload"] and mode not in QUOTE_MODES:
        return [f"$.payload.quote: only {', '.join(sorted(QUOTE_MODES))} show a quotation"]
    if "intro" in content["payload"] and mode not in INTRO_MODES:
        return [f"$.payload.intro: only {', '.join(sorted(INTRO_MODES))} show an intro"]
    envelope = question_envelope(content)
    found = schema.schema_errors(envelope)
    if found:
        return found
    fixed = FIXED_PROMPTS.get(mode)
    if fixed is not None and content["payload"]["prompt"] != fixed:
        return [f"$.payload.prompt: {mode!r} always asks {fixed!r}"]
    if mode in MODES:
        return schema.consistency_errors(envelope)
    return [f"$.payload.{message}" for message in TYPES[content["type"]].check(content["payload"])]


def _item_errors(content: dict[str, Any]) -> list[str]:
    found = _keys(content, _ITEM_KEYS)
    if found:
        return found
    name = content["name"]
    if not isinstance(name, str) or not 1 <= len(name.strip()) <= ITEM_NAME_MAX:
        return [f"$.name: an item name of 1 to {ITEM_NAME_MAX} characters"]
    return []


def errors(kind: str, content: Any) -> list[str]:
    """Every problem with ``content`` as a suggestion of ``kind``; empty when it is good."""
    if not isinstance(content, dict):
        return ["$: a suggestion is a JSON object"]
    found = text.errors(content)
    if found:
        return found
    if kind == "question":
        return _question_errors(content)
    return _item_errors(content)


def tidy(kind: str, content: dict[str, Any]) -> dict[str, Any]:
    """``content`` as it is stored: strings a player typed, trimmed."""
    if kind == "item":
        return {"name": content["name"].strip()}
    return content


def _submission_errors(kind: str, content: dict[str, Any], shown: bool) -> list[str]:
    # Not part of ``errors``: the import script reads an item already on the roster as one
    # to skip, not one to refuse.
    if kind != "item":
        return []
    found = []
    if shown:
        found.append("$.credit_shown: an item's credit is never shown to players")
    roster = vocab.get("items")
    names = {vocab.fold(entry.name) for entry in roster.entries} if roster else set()
    if vocab.fold(content["name"]) in names:
        found.append(f"$.name: {content['name']!r} is already on the roster")
    return found


def check(kind: str, content: Any, shown: bool) -> dict[str, Any]:
    """``content`` tidied, or ``BadSuggestion`` naming everything wrong with it.

    Checked again once tidied, so a name of only spaces is refused as empty.
    """
    found = errors(kind, content)
    if not found:
        content = tidy(kind, content)
        found = errors(kind, content) or _submission_errors(kind, content, shown)
    if found:
        raise BadSuggestion("; ".join(found))
    return content


# --- storage --------------------------------------------------------------------------

_COLUMNS = "id, kind, content, credit, credit_shown, status, created_at, exported_at"


def view(row: asyncpg.Record) -> dict[str, Any]:
    """One row as the admin page gets it."""
    return {
        "id": row["id"],
        "kind": row["kind"],
        "content": row["content"],
        "credit": row["credit"],
        "credit_shown": row["credit_shown"],
        "status": row["status"],
        "created_at": row["created_at"],
        "exported_at": row["exported_at"],
        "playable": playable(row["kind"], row["content"]),
    }


async def add(
    pool: asyncpg.Pool, kind: str, content: dict[str, Any], credit: str, shown: bool
) -> UUID:
    """Store a checked suggestion as pending; its id."""
    return await pool.fetchval(
        "insert into suggestions (kind, content, credit, credit_shown)"
        " values ($1, $2, $3, $4) returning id",
        kind,
        content,
        credit,
        shown,
    )


async def listing(pool: asyncpg.Pool, status: Status) -> dict[str, Any]:
    """The suggestions with ``status``, oldest first, and how many each status holds."""
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            f"select {_COLUMNS} from suggestions where status = $1 order by created_at, id",
            status,
        )
        counts = await conn.fetch(
            "select status, count(*)::int as n from suggestions group by status"
        )
    totals = {"pending": 0, "approved": 0, "rejected": 0, "imported": 0}
    totals.update({row["status"]: row["n"] for row in counts})
    return {"suggestions": [view(row) for row in rows], "counts": totals}


async def edit(
    pool: asyncpg.Pool, suggestion: UUID, content: dict[str, Any], credit: str, shown: bool
) -> dict[str, Any]:
    """Replace what a suggestion says. It must be exported again before it counts as imported."""
    kind = await pool.fetchval("select kind from suggestions where id = $1", suggestion)
    if kind is None:
        raise SuggestionNotFound("no such suggestion")
    content = check(kind, content, shown)
    row = await pool.fetchrow(
        "update suggestions set content = $2, credit = $3, credit_shown = $4, exported_at = null"
        f" where id = $1 returning {_COLUMNS}",
        suggestion,
        content,
        credit,
        shown,
    )
    if row is None:
        raise SuggestionNotFound("no such suggestion")
    return view(row)


async def set_status(
    pool: asyncpg.Pool, suggestion: UUID, status: Literal["pending", "approved", "rejected"]
) -> dict[str, Any]:
    """Approve, reject or reopen one. It must be exported again before it counts as imported."""
    row = await pool.fetchrow(
        "update suggestions set status = $2, exported_at = null"
        f" where id = $1 returning {_COLUMNS}",
        suggestion,
        status,
    )
    if row is None:
        raise SuggestionNotFound("no such suggestion")
    return view(row)


def export_entry(kind: str, content: dict[str, Any], credit: str, shown: bool) -> dict[str, Any]:
    """One suggestion as the import script reads it. A question is in Create's export shape."""
    if kind == "question":
        entry = {"type": content["type"], "payload": content["payload"]}
        if "random_event" in content:
            entry["random_event"] = content["random_event"]
        entry["mode"] = content["mode"]
        entry |= {key: content[key] for key in ("wiki", "source_url") if key in content}
    else:
        entry = dict(content)
    return entry | {"credit": credit, "credit_shown": shown}


def export_file(rows: Sequence[asyncpg.Record]) -> dict[str, list[dict[str, Any]]]:
    """The file an export downloads: questions and items, oldest first."""
    out: dict[str, list[dict[str, Any]]] = {"questions": [], "items": []}
    for row in rows:
        out[f"{row['kind']}s"].append(
            export_entry(row["kind"], row["content"], row["credit"], row["credit_shown"])
        )
    return out


async def export(pool: asyncpg.Pool, status: Literal["approved", "imported"]) -> dict[str, Any]:
    """Every playable approved suggestion, marked exported; or every imported one, again.

    A question for a round not built yet stays out, because the import script could place
    it nowhere and one refused entry stops the whole file.
    """
    if status == "imported":
        rows = await pool.fetch(
            f"select {_COLUMNS} from suggestions where status = 'imported' order by created_at, id"
        )
        return export_file(rows)
    rows = await pool.fetch(
        "update suggestions set exported_at = now()"
        " where status = 'approved' and (kind <> 'question' or content->>'mode' = any($1::text[]))"
        f" returning {_COLUMNS}",
        list(MODES),
    )
    return export_file(sorted(rows, key=lambda row: (row["created_at"], row["id"])))


async def mark_imported(pool: asyncpg.Pool) -> int:
    """Move the approved suggestions the last export downloaded to imported; how many."""
    done = await pool.fetch(
        "update suggestions set status = 'imported'"
        " where status = 'approved' and exported_at is not null returning id"
    )
    return len(done)
