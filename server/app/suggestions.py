"""What players suggest for the packs, and the operator's queue of it.

A player who has finished a game may suggest one of two kinds of content:

- ``question``: a question for a mode, in the shape Create's editor writes it, plus the
  mode it is for and where it was checked: the wiki page, an https ``source_url`` for what
  the wiki cannot prove, or both, and its ``difficulty`` unless a random event asks it. A
  Drop Table or Minigame Madness question may name an item to picture, as ``picture_item``;
  the import script turns the name into the payload's ``image``. A Who's That NPC? question
  is only its fixed prompt and the NPC's name, an NPC not asked about yet: the import script
  finds the rest. A round not built yet takes them too, so its pack is ready when it opens;
  such a suggestion waits in the queue until it is. A player who cannot place a question may
  send it with no mode: the operator picks its round before approving it.
- ``item``: an item name for the roster (``data/popular-items.json``) that is not on it yet.
  The import script finds its id, so a player needs to know no more than the name.

Every suggestion carries a ``credit``, a name held to a display name's rules, and whether
players may see it. An item's is kept but never shown: the rounds it feeds have no reveal
that names a question's author. Nothing here plays: an approved suggestion reaches a game
only through an export, ``scripts/import_suggestions.py`` and a release, so packs stay in git.

Validation is the packs' own wherever a pack question results: the schema, the type's
``check`` and, for a built mode, the mode and NPC rules. A question with no round yet is
held to its type's alone, and to the rest once the operator gives it one. Content the
server stores goes back out only to the operator, and the client draws it as text.
"""

from collections.abc import Sequence
from typing import Any, Literal
from uuid import UUID

import asyncpg

from app import reports, similar
from app.errors import ApiError
from app.modes import MODES, steps_of
from app.questions import schema, text, vocab
from app.questions.packs import Pack, mode_questions
from app.questions.submission import Submission
from app.questions.types import TYPES, scoring_of
from app.questions.types.scoring import Scoring
from app.rooms import scoring

Kind = Literal["question", "item"]
Status = Literal["pending", "approved", "rejected", "imported"]

_CHOICE = frozenset({"multiple_choice"})
# The modes a player may write a question for, and the types its editor offers. An NPC's
# question is any type a host may write, an ordering or a matching, as an NPC's file holds;
# the rounds still to be built are all four buttons.
QUESTION_MODES: dict[str, frozenset[str]] = {
    "random_event": frozenset(
        {
            "multiple_choice",
            "free_text",
            "closest_number",
            "number_slider",
            "pick_all_that_apply",
            "ordering",
            "matching",
        }
    ),
    "bestiary": frozenset(
        {
            "multiple_choice",
            "free_text",
            "closest_number",
            "number_slider",
            "pick_all_that_apply",
            "ordering",
            "matching",
        }
    ),
    "drop_table": frozenset(
        {
            "multiple_choice",
            "free_text",
            "closest_number",
            "number_slider",
            "pick_all_that_apply",
            "matching",
        }
    ),
    "guess_examine": _CHOICE,
    "odd_one_out": _CHOICE,
    "who_said_that": _CHOICE,
    "scaperune": _CHOICE,
    "know_your_content_creator": frozenset(
        {"multiple_choice", "closest_number", "number_slider", "pick_all_that_apply"}
    ),
    "minigame_madness": frozenset(
        {
            "multiple_choice",
            "free_text",
            "closest_number",
            "number_slider",
            "pick_all_that_apply",
            "ordering",
            "matching",
        }
    ),
    "sort_it_out": frozenset({"ordering"}),
    "release_order": frozenset({"ordering"}),
    "whos_that_npc": frozenset({"pick_from_list", "multiple_choice"}),
}

# Rounds whose prompt may be a list, one entry a line.
LINED_MODES = frozenset({"scaperune"})

# The rounds that show a quotation under the prompt (``multiple_choice.quote``).
QUOTE_MODES = frozenset({"who_said_that", "know_your_content_creator"})

# Rounds whose questions all ask the same thing: the pack's tests hold them to it.
FIXED_PROMPTS = {"odd_one_out": "Which one doesn't belong?", "whos_that_npc": "Who's that NPC?"}

# An examine line is its own joke, and an NPC's name is its own answer: a line after either
# only repeats it.
NO_EXPLANATION_MODES = frozenset({"guess_examine", "whos_that_npc"})

# The intro is an NPC's line before the question, so only an NPC's question takes one.
INTRO_MODES = frozenset({"random_event"})

# Pack questions' tags by mode and type, which a suggestion is not asked for.
TAGS = {
    ("guess_examine", "multiple_choice"): ["examine"],
    ("whos_that_npc", "pick_from_list"): ["shadow"],
    ("whos_that_npc", "multiple_choice"): ["render"],
}
# Rounds whose pack holds every question to the wiki page its author checked.
WIKI_MODES = frozenset({"guess_examine", "whos_that_npc"})
# Rounds whose answer a player names, knowing no id: a ``pick_from_list`` payload is the
# prompt and ``subject.name``, and the import script finds the id, fills in the rest and adds
# the name to the round's list.
NAMED_MODES = {"whos_that_npc": "npcs"}
# Rounds whose ``multiple_choice`` right option is an NPC's name: the import script finds its
# id and makes its render the ``image``. Not on the list, which holds what a shadow may be.
RENDER_MODES = frozenset({"whos_that_npc"})
NPC_NAME_MAX = 80
# The longest item names on the wiki are about 50 characters.
ITEM_NAME_MAX = 80

# What a question with no round may be: Create's types, an ordering and a matching, as most
# rounds take them. No NPC, intro, quote or fixed prompt, which only a round gives.
UNPLACED_TYPES = frozenset(
    {
        "multiple_choice",
        "free_text",
        "closest_number",
        "number_slider",
        "pick_all_that_apply",
        "ordering",
        "matching",
    }
)

_QUESTION_KEYS = {"type", "payload"}
_QUESTION_OPTIONAL = frozenset(
    {"mode", "random_event", "wiki", "source_url", "picture_item", "difficulty"}
)
DIFFICULTIES = ("easy", "medium", "hard")
# A random event's question is drawn whatever the room's difficulty, so a tier would mean nothing.
NO_DIFFICULTY_MODES = frozenset({"random_event"})
# Players know an item by name, not id: the import script finds the id and sets the picture.
PICTURE_ITEM_MODES = frozenset({"drop_table", "minigame_madness"})
_ITEM_KEYS = {"name"}


class BadSuggestion(ApiError):
    status, code = 422, "bad_suggestion"


class NoRound(ApiError):
    status, code = 422, "no_round"


class BadTryValue(ApiError):
    status, code = 422, "bad_value"


class SuggestionNotFound(ApiError):
    status, code = 404, "not_found"


def playable(kind: str, content: dict[str, Any]) -> bool:
    """Whether the import script can place it now: false with no round, or one not built yet."""
    return kind != "question" or content.get("mode") in MODES


def question_envelope(content: dict[str, Any]) -> dict[str, Any]:
    """A question suggestion as the pack question it would become, NPC stamped as a file would."""
    envelope = {
        "type": content["type"],
        "mode": content["mode"],
        "source": "pack",
        "tags": TAGS.get((content["mode"], content["type"]), []),
        "payload": content["payload"],
    }
    for key in ("wiki", "source_url", "random_event", "difficulty"):
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


def _question_errors(content: dict[str, Any], sourced: bool) -> list[str]:
    found = _keys(content, _QUESTION_KEYS, _QUESTION_OPTIONAL)
    if found:
        return found
    if sourced and not {"wiki", "source_url"} & content.keys():
        return ["$.wiki: a wiki page, or $.source_url: another https link, to check it against"]
    mode = content.get("mode")
    if "mode" in content and not isinstance(mode, str):
        return ["$.mode: a round's name, or no mode at all for the operator to pick one"]
    if sourced and mode in WIKI_MODES and "wiki" not in content:
        return [f"$.wiki: required, since {mode!r} is checked against the wiki"]
    types = UNPLACED_TYPES if mode is None else QUESTION_MODES.get(mode)
    if types is None:
        return [f"$.mode: {mode!r} takes no suggestions (it takes {', '.join(QUESTION_MODES)})"]
    if content["type"] not in types:
        where = "a question with no round" if mode is None else repr(mode)
        return [f"$.type: {content['type']!r} is not offered for {where}"]
    if (mode == "random_event") != ("random_event" in content):
        return ["$.random_event: an NPC's question names its NPC, and only it does"]
    if "difficulty" in content:
        found = difficulty_errors(mode, content["difficulty"])
        if found:
            return found
    links = [content[key] for key in ("wiki", "source_url") if key in content]
    if not isinstance(content["payload"], dict) or not all(isinstance(url, str) for url in links):
        return ["$.payload: an object, and $.wiki and $.source_url: links"]
    if mode in NAMED_MODES and content["type"] == "pick_from_list":
        return _named_errors(mode, content["payload"])
    if mode in RENDER_MODES and "image" in content["payload"]:
        return ["$.payload.image: none; the import script adds the NPC's render"]
    if "quote" in content["payload"] and mode not in QUOTE_MODES:
        return [f"$.payload.quote: only {', '.join(sorted(QUOTE_MODES))} show a quotation"]
    if "intro" in content["payload"] and mode not in INTRO_MODES:
        return [f"$.payload.intro: only {', '.join(sorted(INTRO_MODES))} show an intro"]
    if "explanation" in content["payload"] and mode in NO_EXPLANATION_MODES:
        return [f"$.payload.explanation: {mode!r} shows no explanation"]
    found = _icon_errors(content["type"], content["payload"])
    if found:
        return found
    if "picture_item" in content:
        found = _picture_item_errors(mode, content["picture_item"])
        if found:
            return found
    if mode is None:
        found = schema.payload_errors(content["type"], content["payload"])
        return found or [
            f"$.payload.{message}" for message in TYPES[content["type"]].check(content["payload"])
        ]
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


def difficulty_errors(mode: str | None, difficulty: Any) -> list[str]:
    """What is wrong with ``difficulty`` on a question of ``mode``; empty when it is good."""
    if mode in NO_DIFFICULTY_MODES:
        return [f"$.difficulty: {mode!r} questions ignore the room's difficulty, so take none"]
    if difficulty not in DIFFICULTIES:
        return [f"$.difficulty: one of {', '.join(DIFFICULTIES)}"]
    return []


def _icon_errors(type_: str, payload: dict[str, Any]) -> list[str]:
    # A player knows a field by name, not by asset id; the operator adds pictures in /admin.
    fields = payload.get("fields")
    if type_ != "matching" or not isinstance(fields, list):
        return []
    return [
        f"$.payload.fields[{index}].icon: a suggestion names its fields; pictures come later"
        for index, field in enumerate(fields)
        if isinstance(field, dict) and "icon" in field
    ]


def _named_errors(mode: str, payload: dict[str, Any]) -> list[str]:
    subject = payload.get("subject")
    if (
        payload.keys() != {"prompt", "subject"}
        or not isinstance(subject, dict)
        or set(subject) != {"name"}
    ):
        return ["$.payload: only a prompt and subject.name; the import script adds the rest"]
    name = subject["name"]
    if not isinstance(name, str) or not 1 <= len(name.strip()) <= NPC_NAME_MAX:
        return [f"$.payload.subject.name: a name of 1 to {NPC_NAME_MAX} characters"]
    if payload["prompt"] != FIXED_PROMPTS[mode]:
        return [f"$.payload.prompt: {mode!r} always asks {FIXED_PROMPTS[mode]!r}"]
    return []


def named(content: dict[str, Any]) -> str | None:
    """The answer a named round's question gives by name, or ``None`` for any other question."""
    if content.get("mode") not in NAMED_MODES or content["type"] != "pick_from_list":
        return None
    return content["payload"]["subject"]["name"]


def rendered(content: dict[str, Any]) -> str | None:
    """The NPC a render question pictures, its right option, or ``None`` for any other question."""
    if content.get("mode") not in RENDER_MODES or content["type"] != "multiple_choice":
        return None
    payload = content["payload"]
    return payload["options"][payload["answer_index"]]


def _picture_item_errors(mode: str, name: Any) -> list[str]:
    if mode not in PICTURE_ITEM_MODES:
        return [f"$.picture_item: only {', '.join(sorted(PICTURE_ITEM_MODES))} show an item"]
    if not isinstance(name, str) or not 1 <= len(name.strip()) <= ITEM_NAME_MAX:
        return [f"$.picture_item: an item name of 1 to {ITEM_NAME_MAX} characters"]
    return []


def _item_errors(content: dict[str, Any]) -> list[str]:
    found = _keys(content, _ITEM_KEYS)
    if found:
        return found
    name = content["name"]
    if not isinstance(name, str) or not 1 <= len(name.strip()) <= ITEM_NAME_MAX:
        return [f"$.name: an item name of 1 to {ITEM_NAME_MAX} characters"]
    return []


def errors(kind: str, content: Any, sourced: bool = True) -> list[str]:
    """Every problem with ``content`` as a suggestion of ``kind``; empty when it is good.

    Without ``sourced`` a question needs no link: a similarity check comes before one.
    """
    if not isinstance(content, dict):
        return ["$: a suggestion is a JSON object"]
    found = text.errors(content)
    if found:
        return found
    if kind == "question":
        return _question_errors(content, sourced)
    return _item_errors(content)


def tidy(kind: str, content: dict[str, Any]) -> dict[str, Any]:
    """``content`` as it is stored: strings a player typed, trimmed."""
    if kind == "item":
        return {"name": content["name"].strip()}
    if "picture_item" in content:
        return {**content, "picture_item": content["picture_item"].strip()}
    name = named(content)
    if name is not None:
        return {**content, "payload": {**content["payload"], "subject": {"name": name.strip()}}}
    if content.get("mode") in LINED_MODES:
        typed = [line.strip() for line in content["payload"]["prompt"].splitlines()]
        prompt = "\n".join(line for line in typed if line)
        return {**content, "payload": {**content["payload"], "prompt": prompt}}
    return content


def _submission_errors(kind: str, content: dict[str, Any], shown: bool) -> list[str]:
    # Not part of ``errors``: the import script reads an item already on the roster, or an
    # NPC already asked about, as one to skip, not one to refuse.
    name = named(content) if kind == "question" else None
    if name is not None:
        # Every name on a named round's list is asked about, so the list is the pack's answers.
        listed = vocab.get(NAMED_MODES[content["mode"]])
        names = {vocab.fold(entry.name) for entry in listed.entries} if listed else set()
        if vocab.fold(name) in names:
            return [f"$.payload.subject.name: {name!r} is already in the game"]
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


# --- trying a question ------------------------------------------------------------------

# Nobody answers it: grading only needs one submission to hand back.
_TRIER = UUID(int=0)


def trial(content: dict[str, Any], value: Any) -> dict[str, Any]:
    """A checked question's open view and reveal, and with ``value`` what that answer earns.

    The view is the server's, shuffled as a room shows it, because a value is a position in
    it. Speed never counts, as in a team game, so the points are ``credit`` of 1000. A named
    round's NPC is not on its list yet, so nobody can pick it: its reveal is the name alone.
    """
    type_ = content["type"]
    module = TYPES[type_]
    payload = content["payload"]
    view = module.client_view(payload)
    name = named(content)
    if name is not None:
        if value is not None:
            raise BadTryValue("this NPC is not on the list yet, so it cannot be picked")
        return {"view": view, "reveal": {**view, "subject": {"name": name}}, "result": None}
    reveal = module.reveal(payload)
    if value is None:
        return {"view": view, "reveal": reveal, "result": None}
    parsed = module.parse_value(payload, value)
    if parsed is None:
        raise BadTryValue(f"not a valid answer to a {type_} question")
    raw = module.grade(payload, [Submission(_TRIER, parsed)]).get(_TRIER, 0.0)
    credit = scoring.settle_credit(type_, raw)
    steps = steps_of(content.get("mode") or "")
    how = scoring.effective(scoring_of(type_), steps)
    band = 1 if how is Scoring.STEP else None
    points = scoring.points_for(how, credit, band, steps, team=True)
    result = {"value": parsed, "correct": credit >= 1.0, "credit": credit, "points": points}
    return {"view": view, "reveal": reveal, "result": result}


# --- similar questions ----------------------------------------------------------------

# Content hashes as ids, so a reloaded pack's unchanged questions keep theirs.
_pack_features: dict[str, similar.Features] = {}


def _pack_candidates(packs: list[Pack]) -> list[tuple[dict[str, Any], similar.Features]]:
    # Every mode with a pack of its own, events too: the same question in two rounds is
    # still a duplicate. The price modes' packs are generated per instance from the roster.
    found = []
    for mode in reports.pack_modes():
        if mode in reports.ITEM_MODES:
            continue
        for question in mode_questions(packs, mode):
            if question["id"] not in _pack_features:
                _pack_features[question["id"]] = similar.features(question)
            found.append((question, _pack_features[question["id"]]))
    return found


def check_similar(content: Any) -> dict[str, Any]:
    """A question to look for in the packs, tidied, or ``BadSuggestion``; it needs no link."""
    found = errors("question", content, sourced=False)
    if not found:
        content = tidy("question", content)
        found = errors("question", content, sourced=False)
    if found:
        raise BadSuggestion("; ".join(found))
    return content


def similar_in_packs(packs: list[Pack], content: dict[str, Any]) -> list[dict[str, Any]]:
    """The pack questions a checked question looks like, as labels: never an answer."""
    matches = similar.best(similar.features(content), _pack_candidates(packs))
    return [
        {"mode": question["mode"], "label": reports.label(question), "score": score}
        for score, question in matches
    ]


def _matches(
    row: asyncpg.Record,
    packs: list[dict[str, Any]],
    queued: list[asyncpg.Record],
    features: dict[UUID, similar.Features],
) -> list[dict[str, Any]]:
    # The operator sees answers anyway, so a match is the whole question.
    candidates: list[tuple[tuple[UUID | None, dict[str, Any]], similar.Features]] = [
        ((None, question), found) for question, found in packs
    ]
    candidates += [
        ((other["id"], other["content"]), features[other["id"]])
        for other in queued
        if other["id"] != row["id"]
    ]
    own = features.get(row["id"]) or similar.features(row["content"])
    return [
        {"score": score, "suggestion": suggestion, "question": question}
        for score, (suggestion, question) in similar.best(own, candidates)
    ]


# --- storage --------------------------------------------------------------------------

_COLUMNS = "id, kind, content, credit, credit_shown, status, created_at, exported_at"


def _placed(kind: str, content: dict[str, Any]) -> bool:
    return kind != "question" or "mode" in content


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


async def listing(pool: asyncpg.Pool, status: Status, packs: list[Pack]) -> dict[str, Any]:
    """The suggestions with ``status``, oldest first, and how many each status holds.

    Each question carries the ``similar.TOP`` pack questions and other pending or approved
    suggestions it looks most like, never itself.
    """
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            f"select {_COLUMNS} from suggestions where status = $1 order by created_at, id",
            status,
        )
        counts = await conn.fetch(
            "select status, count(*)::int as n from suggestions group by status"
        )
        queued = await conn.fetch(
            "select id, content from suggestions"
            " where kind = 'question' and status in ('pending', 'approved')"
        )
    totals = {"pending": 0, "approved": 0, "rejected": 0, "imported": 0}
    totals.update({row["status"]: row["n"] for row in counts})
    features = {row["id"]: similar.features(row["content"]) for row in queued}
    candidates = _pack_candidates(packs)
    return {
        "suggestions": [
            view(row)
            | {
                "matches": _matches(row, candidates, queued, features)
                if row["kind"] == "question"
                else []
            }
            for row in rows
        ],
        "counts": totals,
    }


async def edit(
    pool: asyncpg.Pool, suggestion: UUID, content: dict[str, Any], credit: str, shown: bool
) -> dict[str, Any]:
    """Replace what a suggestion says. It must be exported again before it counts as imported."""
    current = await pool.fetchrow("select kind, status from suggestions where id = $1", suggestion)
    if current is None:
        raise SuggestionNotFound("no such suggestion")
    kind = current["kind"]
    content = check(kind, content, shown)
    if current["status"] == "approved" and not _placed(kind, content):
        raise NoRound("an approved question keeps a round")
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
    """Approve, reject or reopen one. It must be exported again before it counts as imported.

    A question with no round cannot be approved: no export would ever include it.
    """
    if status == "approved":
        current = await pool.fetchrow(
            "select kind, content from suggestions where id = $1", suggestion
        )
        if current is None:
            raise SuggestionNotFound("no such suggestion")
        if not _placed(current["kind"], current["content"]):
            raise NoRound("pick its round before approving it")
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
        entry |= {
            key: content[key]
            for key in ("wiki", "source_url", "picture_item", "difficulty")
            if key in content
        }
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
