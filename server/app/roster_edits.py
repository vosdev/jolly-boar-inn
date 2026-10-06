"""The operator's pending renames and removals of popular items.

The roster (``data/popular-items.json``) lives in git, so a change made in ``/admin`` never
touches the running server's. It queues keyed by the item's id, leaves in an export, and
reaches the roster through ``scripts/edit_roster.py`` and a release, the way question edits
reach the packs. A second change to one item replaces the first. Adding an item stays with
suggestions, whose import finds the id on the wiki.

A rename is checked against the roster as it is: a name another item has, or another pending
rename takes, would stop the roster loading. Whether a tradeable's new name matches the
wiki's is the next ``make gen-price-questions``'s to say.
"""

from collections.abc import Iterable
from typing import Any

import asyncpg

from app.errors import ApiError
from app.questions import text, vocab
from app.suggestions import ITEM_NAME_MAX


class BadRename(ApiError):
    status, code = 422, "bad_rename"


class ItemNotFound(ApiError):
    status, code = 404, "not_found"


def roster() -> list[dict[str, Any]]:
    """The running roster's items, in the file's order."""
    found = vocab.get("items")
    return [{"id": entry.id, "name": entry.name} for entry in found.entries] if found else []


def find(item_id: int) -> dict[str, Any]:
    """The roster item with ``item_id``, or a 404 naming it."""
    for item in roster():
        if item["id"] == item_id:
            return item
    raise ItemNotFound(f"item {item_id} is not on the roster")


def name_problems(name: Any) -> list[str]:
    """Why ``name`` is no item name; empty when it is one."""
    if not isinstance(name, str) or not 1 <= len(name.strip()) <= ITEM_NAME_MAX:
        return [f"$.name: an item name of 1 to {ITEM_NAME_MAX} characters"]
    return text.errors(name, "$.name")


# --- storage --------------------------------------------------------------------------

_COLUMNS = "item_id, action, name, before, updated_at, exported_at"


def view(row: asyncpg.Record) -> dict[str, Any]:
    """One change as the admin page gets it, and whether its item is still on the roster."""
    on_roster = {item["id"] for item in roster()}
    return dict(row) | {"in_roster": row["item_id"] in on_roster}


async def _save(
    pool: asyncpg.Pool, item: dict[str, Any], action: str, name: str | None
) -> dict[str, Any]:
    row = await pool.fetchrow(
        "insert into roster_edits (item_id, action, name, before) values ($1, $2, $3, $4)"
        " on conflict (item_id) do update set action = excluded.action, name = excluded.name,"
        " updated_at = now(), exported_at = null"
        f" returning {_COLUMNS}",
        item["id"],
        action,
        name,
        item["name"],
    )
    return view(row)


async def rename(pool: asyncpg.Pool, item_id: int, name: Any) -> dict[str, Any]:
    """Queue a rename of a roster item, replacing any change already queued for it."""
    item = find(item_id)
    found = name_problems(name)
    if found:
        raise BadRename("; ".join(found))
    name = name.strip()
    if name == item["name"]:
        raise BadRename("the rename changes nothing")
    wanted = vocab.fold(name)
    if any(vocab.fold(other["name"]) == wanted for other in roster() if other["id"] != item_id):
        raise BadRename(f"$.name: another item is already called {name!r}")
    clash = await pool.fetchval(
        "select item_id from roster_edits where action = 'rename' and item_id <> $1"
        " and lower(name) = lower($2)",
        item_id,
        name,
    )
    if clash is not None:
        raise BadRename(f"$.name: the pending rename of item {clash} takes {name!r}")
    return await _save(pool, item, "rename", name)


async def remove(pool: asyncpg.Pool, item_id: int) -> dict[str, Any]:
    """Queue the removal of a roster item, replacing any change already queued for it."""
    return await _save(pool, find(item_id), "remove", None)


async def listing(pool: asyncpg.Pool) -> dict[str, Any]:
    """Every queued change, oldest first."""
    rows = await pool.fetch(f"select {_COLUMNS} from roster_edits order by updated_at, item_id")
    return {"changes": [view(row) for row in rows]}


async def discard(pool: asyncpg.Pool, item_id: int) -> None:
    """Drop the change queued for an item."""
    done = await pool.fetchval(
        "delete from roster_edits where item_id = $1 returning item_id", item_id
    )
    if done is None:
        raise ItemNotFound(f"no change is queued for item {item_id}")


def export_file(rows: Iterable[asyncpg.Record]) -> dict[str, Any]:
    """The file ``make edit-roster`` reads: renames by item id, and removed ids."""
    out: dict[str, Any] = {"renames": [], "removes": []}
    for row in rows:
        if row["action"] == "rename":
            out["renames"].append({"id": row["item_id"], "name": row["name"]})
        else:
            out["removes"].append(row["item_id"])
    return out


async def export(pool: asyncpg.Pool) -> dict[str, Any]:
    """Every queued change, marked exported."""
    rows = await pool.fetch(f"update roster_edits set exported_at = now() returning {_COLUMNS}")
    return export_file(sorted(rows, key=lambda row: row["item_id"]))


async def mark_applied(pool: asyncpg.Pool) -> int:
    """Drop the changes the last export downloaded, now that git holds them; how many."""
    done = await pool.fetch(
        "delete from roster_edits where exported_at is not null returning item_id"
    )
    return len(done)
