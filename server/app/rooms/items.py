"""Items for the lower half of the standings ("Scoring" in ideas/architecture.md).

On the standings between two rounds, the lowest ``floor(players / 2)`` positions each find
one item for the next round, and the lowest ``ceil`` half of those may find a strong one.
A tie at either edge widens it: everyone level with the edge position is on the lower
side. The draw is seeded by the room, the round, the player's uuid and the room's
rematches, so a restart, a reconnect or a rename deals the same item, and uniform over the
items the tier allows that fit the round.

An item lives in one slot on the player (``Worn``) and breaks at the end of the round it
was dealt for, used or not, so every drop finds the slot empty. Its effects are two hooks
the game loop calls: ``on_answer`` after ``points_for`` at each close, and ``settle`` once
the round's last question has closed. What they add is item points, stored beside the
answer's own points and never as credit, so ``question_stats`` and ``answer_timings`` stay
as they would be without items.

Pure functions and data, no I/O: the loop does the writing.
"""

import hashlib
import math
import random
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from typing import TYPE_CHECKING, Literal
from uuid import UUID

if TYPE_CHECKING:
    from app.rooms.models import RoomQuestion

Tier = Literal["strong", "mild"]

# Fewer scoring players than this and nobody is behind enough to need help.
MIN_PLAYERS = 4
# How much longer the standings hold when a drop has receivers: the rows move, then the
# boxes open.
DROP_SECONDS = 4


@dataclass(frozen=True, slots=True)
class Worn:
    """The item in a player's one slot: ``players.item``, ``item_round``, ``item_charges``."""

    item: str
    round: int
    """The round it works in, as ``Segment.index`` counts; it breaks at that round's end."""
    charges: int | None = None
    """What is left of an item that is spent a charge at a time; ``None`` for the rest."""


@dataclass(frozen=True, slots=True)
class Answered:
    """One answer as the close graded it, before any item."""

    question: RoomQuestion
    credit: float
    band: int | None
    points: int


@dataclass(frozen=True, slots=True)
class Effect:
    """What an item did to one answer."""

    points: int
    """Item points on top of the answer's own; 0 when it did nothing."""
    worn: Worn | None
    """The slot afterwards: unchanged, a charge down, or ``None`` once the item broke."""


@dataclass(frozen=True, slots=True)
class Item:
    id: str
    tier: Tier
    fits: Callable[[Sequence[RoomQuestion]], bool]
    """Whether the round, every question in it, has one the item works on."""
    charges: int | None = None
    on_answer: Callable[[Worn, Answered], Effect] | None = None
    settle: Callable[[Worn, Mapping[UUID, int]], Mapping[UUID, int]] | None = None
    """At the round's end: the wearer's base points per answered question of the round in,
    item points to add per question out."""


# The items players can find. Empty until the first ones ship; the tests deal their own.
ITEMS: tuple[Item, ...] = ()


def receivers(rows: Sequence[tuple[UUID, int]]) -> dict[UUID, Tier]:
    """Who finds an item and from which tier, given the standings as ``(player, rank)`` in
    their order: the lowest ``floor(n / 2)`` positions, the lowest ``ceil`` half of them
    strong, each widened by the players tied with its edge.
    """
    n = len(rows)
    if n < MIN_PLAYERS:
        return {}
    found = n // 2
    strong = math.ceil(found / 2)
    edge, strong_edge = rows[n - found][1], rows[n - strong][1]
    return {
        player: "strong" if rank >= strong_edge else "mild" for player, rank in rows if rank >= edge
    }


def seeded(code: str, round_: int, player: UUID, rematches: int) -> random.Random:
    """The draw for ``player`` in ``round_``: the same on every process and after a rename."""
    key = f"{code.upper()}:{round_}:{player}:{rematches}".encode()
    return random.Random(int.from_bytes(hashlib.sha256(key).digest()))


def draw(
    table: Sequence[Item], tier: Tier, questions: Sequence[RoomQuestion], rng: random.Random
) -> Item | None:
    """One of the items ``tier`` allows that fit ``questions``, or none if nothing fits."""
    offered = [
        item for item in table if (tier == "strong" or item.tier == "mild") and item.fits(questions)
    ]
    return rng.choice(offered) if offered else None


def deal(
    table: Sequence[Item],
    rows: Sequence[tuple[UUID, int]],
    code: str,
    round_: int,
    questions: Sequence[RoomQuestion],
    rematches: int,
) -> dict[UUID, Worn]:
    """The drop for ``round_``, whose questions are ``questions``: each receiver's new item."""
    dealt: dict[UUID, Worn] = {}
    for player, tier in receivers(rows).items():
        item = draw(table, tier, questions, seeded(code, round_, player, rematches))
        if item is not None:
            dealt[player] = Worn(item.id, round_, item.charges)
    return dealt


def by_id(table: Sequence[Item], item_id: str) -> Item | None:
    """The item ``item_id`` names, or ``None`` for one this build no longer has."""
    return next((item for item in table if item.id == item_id), None)
