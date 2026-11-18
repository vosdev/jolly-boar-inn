"""Items for the lower half of the standings ("Scoring" in ideas/architecture.md).

On the standings between two rounds, the lowest ``floor(players / 2)`` positions each find
one item for the next round, and the lowest ``ceil`` half of those may find a strong one.
A tie at either edge widens it: everyone level with the edge position is on the lower
side. The draw is seeded by the room, the round, the player's uuid and the room's
rematches, so a restart, a reconnect or a rename deals the same item, and uniform over the
items the tier allows that fit the round.

An item lives in one slot on the player (``Worn``) and breaks at the end of the round it
was dealt for, used or not, so every drop finds the slot empty. Its effects are hooks the
game loop calls: ``on_answer`` after ``points_for`` at each close, ``settle`` once the
round's last question has closed, and ``removes`` on every open question, for options only
the wearer no longer sees. An item the player uses on an open question has a ``Use``
instead: what it pays at that question's close, after which it is gone. What they add is
item points, stored beside the answer's own points and never as credit, so
``question_stats`` and ``answer_timings`` stay as they would be without items.

Pure functions and data, no I/O: the loop does the writing.
"""

import hashlib
import math
import random
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from typing import TYPE_CHECKING, Literal
from uuid import UUID

from app.questions.types import multiple_choice
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


def _nothing(answered: Answered) -> int:
    return 0


@dataclass(frozen=True, slots=True)
class Use:
    """How a player uses an item on an open question, with ``use_item``."""

    before_answer: bool
    """Refused once the player has answered that question."""
    answers: bool = False
    """The use is the answer: full credit at the moment of the tap, no value of its own."""
    refused_on: frozenset[str] = frozenset()
    """Question types it cannot be used on."""
    pays: Callable[[Answered], int] = _nothing
    """Item points at the close of the question it was used on, given the player's answer;
    a question left unanswered pays nothing."""


@dataclass(frozen=True, slots=True)
class Item:
    id: str
    tier: Tier
    fits: Callable[[Sequence[RoomQuestion]], bool]
    """Whether the round, every question in it, has one the item works on."""
    charges: int | None = None
    on_answer: Callable[[Worn, Answered], Effect] | None = None
    use: Use | None = None
    settle: Callable[[Worn, Mapping[UUID, int]], Mapping[UUID, int]] | None = None
    """At the round's end: the wearer's base points per answered question of the round, in
    question order, in; item points to add per question out."""
    removes: Callable[[Worn, RoomQuestion, random.Random], tuple[int, ...]] | None = None
    """The wrong options the wearer no longer sees on an open question, by shown position,
    drawn from the ``Random`` given. Each question it takes any off costs a charge."""


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


# What a Kebab adds to the question it was eaten on.
KEBAB_POINTS = 300
# A doubled More or Less is a coin flip worth 1000.
NOT_DOUBLED = frozenset({"more_less"})


def _doubles_fit(questions: Sequence[RoomQuestion]) -> bool:
    return any(q.type not in NOT_DOUBLED for q in _answerable(questions))


def _kebab(answered: Answered) -> int:
    return KEBAB_POINTS


def _charos(answered: Answered) -> int:
    """Double for full credit; anything less pays nothing, its own points taken back."""
    return answered.points if answered.credit >= 1.0 else -answered.points


def _lamp(answered: Answered) -> int:
    return answered.points


# How many wrong options Ring of wealth takes off a multiple choice question of so many.
WEALTH_REMOVES = {4: 1, 5: 2, 6: 2}


def _wealth_count(question: RoomQuestion) -> int:
    if question.type != "multiple_choice" or question.host_only:
        return 0
    return WEALTH_REMOVES.get(len(question.payload["options"]), 0)


def _wealth_fits(questions: Sequence[RoomQuestion]) -> bool:
    return any(_wealth_count(question) for question in questions)


def _wealth(worn: Worn, question: RoomQuestion, rng: random.Random) -> tuple[int, ...]:
    """Wrong options off a multiple choice question of four or more, while a charge is left."""
    count = _wealth_count(question)
    if not count or not worn.charges:
        return ()
    right = multiple_choice.shown_answer(question.payload)
    wrong = [index for index in range(len(question.payload["options"])) if index != right]
    return tuple(sorted(rng.sample(wrong, count)))


SUPER_RESTORE = Item("super_restore", "mild", _restore_fits, charges=4, on_answer=_restore)
RING_OF_LIFE = Item("ring_of_life", "strong", _anything, on_answer=_life)
PHOENIX_NECKLACE = Item("phoenix_necklace", "strong", _phoenix_fits, settle=_phoenix)
KEBAB = Item("kebab", "mild", _anything, use=Use(before_answer=False, pays=_kebab))
RING_OF_CHAROS = Item(
    "ring_of_charos",
    "mild",
    _doubles_fit,
    use=Use(before_answer=True, refused_on=NOT_DOUBLED, pays=_charos),
)
BOOK_OF_KNOWLEDGE = Item(
    "book_of_knowledge", "strong", _anything, use=Use(before_answer=True, answers=True)
)
XP_LAMP = Item(
    "xp_lamp",
    "strong",
    _doubles_fit,
    use=Use(before_answer=True, refused_on=NOT_DOUBLED, pays=_lamp),
)
RING_OF_WEALTH = Item("ring_of_wealth", "mild", _wealth_fits, charges=3, removes=_wealth)

# The items players can find.
ITEMS: tuple[Item, ...] = (
    SUPER_RESTORE,
    RING_OF_LIFE,
    PHOENIX_NECKLACE,
    KEBAB,
    RING_OF_CHAROS,
    BOOK_OF_KNOWLEDGE,
    XP_LAMP,
    RING_OF_WEALTH,
)


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


def removed(
    table: Sequence[Item], worn: Worn | None, question: RoomQuestion, code: str, player: UUID
) -> tuple[int, ...]:
    """The options ``worn`` takes off ``question`` for ``player`` alone, by shown position.

    Seeded by the room, the question and the player, so the open, a reconnect, an answer
    and the close all agree without storing it.
    """
    item = None if worn is None else by_id(table, worn.item)
    if worn is None or item is None or item.removes is None:
        return ()
    key = f"{code.upper()}:{question.id}:{player}".encode()
    return item.removes(worn, question, random.Random(int.from_bytes(hashlib.sha256(key).digest())))


def spent(worn: Worn) -> Worn | None:
    """``worn`` a charge down, or ``None`` once that was its last."""
    left = (worn.charges or 0) - 1
    return Worn(worn.item, worn.round, left) if left > 0 else None
