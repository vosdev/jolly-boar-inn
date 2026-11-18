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

from app.questions.types.scoring import Scoring
from app.rooms import scoring

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
    """At the round's end: the wearer's base points per answered question of the round, in
    question order, in; item points to add per question out."""


def _answerable(questions: Sequence[RoomQuestion]) -> list[RoomQuestion]:
    return [question for question in questions if not question.host_only]


# How many speed buckets one dose of Super restore moves an answer up.
RESTORE_BUCKETS = 2
# What Ring of Life raises a low answer to.
LIFE_FLOOR = 500
# The fewest questions a round needs for Phoenix necklace: one to replace, two to average.
PHOENIX_QUESTIONS = 3


def _restore_fits(questions: Sequence[RoomQuestion]) -> bool:
    return any(q.scoring is Scoring.SPEED for q in _answerable(questions))


def _restore(worn: Worn, answered: Answered) -> Effect:
    """A dose on a speed answer with credit: paid as though two buckets quicker."""
    band, charges = answered.band, worn.charges or 0
    if answered.question.scoring is not Scoring.SPEED or band is None or charges <= 0:
        return Effect(0, worn)
    quicker = max(1, band - RESTORE_BUCKETS)
    boosted = scoring.points_for(Scoring.SPEED, answered.credit, quicker, None)
    # Bucket 1, a wrong answer, or credit too small to round up: the dose would not help.
    if boosted <= answered.points:
        return Effect(0, worn)
    left = charges - 1
    return Effect(boosted - answered.points, Worn(worn.item, worn.round, left) if left else None)


def _anything(questions: Sequence[RoomQuestion]) -> bool:
    return bool(_answerable(questions))


def _life(worn: Worn, answered: Answered) -> Effect:
    """The first answer under the floor is raised to it, and the ring breaks."""
    if answered.points >= LIFE_FLOOR:
        return Effect(0, worn)
    return Effect(LIFE_FLOOR - answered.points, None)


def _phoenix_fits(questions: Sequence[RoomQuestion]) -> bool:
    return len(_answerable(questions)) >= PHOENIX_QUESTIONS


def _phoenix(worn: Worn, answered: Mapping[UUID, int]) -> Mapping[UUID, int]:
    """The worst answered question rises to the average of the others, if that is higher.

    ``answered`` is in question order, so of two equally bad answers the earlier rises.
    """
    if len(answered) < 2:
        return {}
    worst = min(answered, key=lambda question: answered[question])
    others = [points for question, points in answered.items() if question != worst]
    # Half up, as the team standings round their averages.
    average = (2 * sum(others) + len(others)) // (2 * len(others))
    gain = average - answered[worst]
    return {worst: gain} if gain > 0 else {}


SUPER_RESTORE = Item("super_restore", "mild", _restore_fits, charges=4, on_answer=_restore)
RING_OF_LIFE = Item("ring_of_life", "strong", _anything, on_answer=_life)
PHOENIX_NECKLACE = Item("phoenix_necklace", "strong", _phoenix_fits, settle=_phoenix)

# The items players can find.
ITEMS: tuple[Item, ...] = (SUPER_RESTORE, RING_OF_LIFE, PHOENIX_NECKLACE)


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
