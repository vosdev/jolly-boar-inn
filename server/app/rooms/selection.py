"""Pick the questions for a new room, in rounds. Pure and seeded, so it is testable.

Two halves. ``select`` draws the rounds: one per mode picked, each from that mode's own
pool. ``place_random_events`` then interrupts them: the host's own questions, and with
``settings.random_events`` some pack questions too, each dropped into a round it does not
belong to by an NPC from ``app/random_events.py``.

The host's questions used to be rounds of their own, placed by ``settings.order``: first
"mixed into the round of their own type", then, once a round was a mode rather than a
type, "wherever the custom round goes". Both were answers to where a host's question
belongs, and the answer turned out to be nowhere in particular, which is the point of an
interruption. So ``order`` and the custom round went, and this is what replaced them.
"""

import random
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any

from app.modes import MODES
from app.questions.packs import Pack
from app.random_events import RANDOM_EVENTS
from app.rooms.settings import RoomSettings

# How often a slot no custom question took gets a pack question instead, when the host
# lets the packs interrupt. Half: often enough that a game of a few rounds usually meets
# one, rarely enough that nobody can count on it.
PACK_RANDOM_EVENT_CHANCE = 0.5


class TooManyEvents(ValueError):
    """More custom questions than there are rounds to interrupt.

    ``NewRoomSettings`` refuses that on the way in, counting the modes picked. This is the
    rarer case it cannot see: a mode whose pool ran dry gives no round, and so no slot.
    """


@dataclass(frozen=True, slots=True)
class Round:
    """One block of questions of one mode, introduced by its own splash.

    A random event inside it is a question of another mode, carrying ``random_event``: the
    id of the NPC asking it. That key is a placement, not part of the question -- it is not
    in the schema or the content id -- and it becomes the ``questions.random_event`` column
    rather than part of the stored payload. ``mode`` is the round's, never an event's.
    """

    mode: str
    questions: list[dict[str, Any]]


def select(
    packs: Sequence[Pack],
    custom: Sequence[dict[str, Any]],
    settings: RoomSettings,
    rng: random.Random,
) -> list[Round]:
    """The room's rounds: one per mode picked, as long as that mode asked to be.

    A mode is a round. Six modes are six rounds, one mode is one round, and how many
    questions each holds is that mode's own ``questions`` setting -- so the quick modes
    can run long and the slow ones short in the same game.

    ``settings.mode_order`` decides the running order: ``"listed"`` plays the rounds in
    the order the host arranged the modes in, ``"random"`` shuffles them once, here, at
    creation. Either way the order is fixed before the first question is stored, because
    the stored questions *are* the running order.

    Pack questions are drawn without replacement from a pool per mode, so no question
    appears twice in a room -- the events drawn afterwards included. A mode whose pool
    runs dry gives a short round, or none at all: an empty round is dropped rather than
    played, because a splash for a round with no questions is a screen that introduces
    nothing.

    A pool is every pack question carrying that ``mode``, never that ``type``. Modes share
    types -- five of them will be ``multiple_choice`` -- and pooling by type would have
    each of those rounds drawing the other four's questions.
    """
    pools: dict[str, list[dict[str, Any]]] = {}
    for pack in packs:
        for question in pack.questions:
            pools.setdefault(question["mode"], []).append(question)
    for pool in pools.values():
        rng.shuffle(pool)
    order = list(settings.modes)
    if settings.mode_order == "random":
        rng.shuffle(order)

    rounds: list[Round] = []
    for entry in order:
        pool = pools.get(entry.mode, [])
        take = min(entry.questions, len(pool))
        if take <= 0:
            continue  # this mode has nothing to play; a round with no questions is not a round
        rounds.append(Round(mode=entry.mode, questions=[pool.pop() for _ in range(take)]))

    return place_random_events(rounds, custom, pools, settings, rng)


def place_random_events(
    rounds: Sequence[Round],
    custom: Sequence[dict[str, Any]],
    pools: Mapping[str, list[dict[str, Any]]],
    settings: RoomSettings,
    rng: random.Random,
) -> list[Round]:
    """Interrupt ``rounds`` with the host's questions, then perhaps with the packs'.

    Four rules, three about rarity and one about abuse:

    - **Never in the first round.** Someone who has seen one mode has no routine yet.
    - **Never a round's first question.** That belongs to the splash that introduced it.
    - **At most one per round**, so it stays a surprise -- and so the host's questions can
      never outnumber the rounds they interrupt.
    - **A distinct NPC each time.** No room sees the same face twice.

    So every round but the first is one slot. The host's questions take theirs first, in
    the order they were written, in slots drawn at random; ``TooManyEvents`` if there are
    fewer slots than questions, because dropping the rest is the one thing a host must
    never find out about during the game. Each lands at a position drawn inside its round,
    anywhere after the first question.

    With ``settings.random_events`` every slot left over gets a pack question with
    probability ``PACK_RANDOM_EVENT_CHANCE``. It is drawn from a mode the host did not
    pick, and failing that from any mode but the round's own: another Drop Table question
    in the middle of the Drop Table round is not an event, it is a long round. It keeps its
    own mode, type and payload. ``pools`` is what ``select`` left of every mode's pool,
    and the draw takes from it, so an event never repeats a question a round already has.

    Returns new rounds; ``rounds`` and the questions in it are left as they were.
    """
    slots = [Round(mode=r.mode, questions=list(r.questions)) for r in rounds]
    if not custom and not settings.random_events:
        return slots
    open_slots = list(range(1, len(slots)))
    if len(custom) > len(open_slots):
        raise TooManyEvents(
            f"{len(custom)} custom questions, but this room only filled {len(slots)} rounds,"
            f" so it has {len(open_slots)} to interrupt"
        )
    faces = list(RANDOM_EVENTS)
    rng.shuffle(faces)

    for index, question in zip(sorted(rng.sample(open_slots, len(custom))), custom, strict=True):
        _interrupt(slots[index], question, faces, rng)
        open_slots.remove(index)

    if settings.random_events:
        picked = set(settings.mode_ids)
        for index in open_slots:
            if not faces or rng.random() >= PACK_RANDOM_EVENT_CHANCE:
                continue
            question = _draw(pools, picked, slots[index].mode, rng)
            if question is not None:
                _interrupt(slots[index], question, faces, rng)
    return slots


def _interrupt(
    round_: Round, question: dict[str, Any], faces: list[str], rng: random.Random
) -> None:
    """Put ``question`` into ``round_`` as an event, after its first question."""
    if not faces:
        # ``test_random_events.py`` keeps the roster longer than any room's slots.
        raise TooManyEvents("the random-event roster has run out of faces")
    at = rng.randrange(1, len(round_.questions) + 1)
    round_.questions.insert(at, {**question, "random_event": faces.pop()})


def _draw(
    pools: Mapping[str, list[dict[str, Any]]],
    picked: set[str],
    interrupted: str,
    rng: random.Random,
) -> dict[str, Any] | None:
    """A pack question for an event in a round of mode ``interrupted``, or ``None``."""
    playable = [
        mode
        for mode, pool in pools.items()
        if pool and mode in MODES and MODES[mode].is_round and mode != interrupted
    ]
    unpicked = [mode for mode in playable if mode not in picked]
    candidates = unpicked or playable
    if not candidates:
        return None
    return pools[rng.choice(candidates)].pop()


def flatten(rounds: Sequence[Round]) -> list[tuple[int, dict[str, Any]]]:
    """``(round number, question)`` in play order, which is the order they are stored in.

    An event carries the number of the round it interrupts, which is what lets
    ``segments.py`` group it back into that round instead of splitting it in three.
    """
    return [(number, q) for number, round_ in enumerate(rounds) for q in round_.questions]
