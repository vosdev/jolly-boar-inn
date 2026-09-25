"""Pick the questions for a new room, in rounds. Pure and seeded, so it is testable.

Two halves. ``select`` draws the rounds: one per mode picked, each from that mode's own
pool. ``place_random_events`` then interrupts them: an NPC turns up in the middle of a
round, asks one question, and leaves. Some of those questions are the host's own; the rest
are the NPCs', from ``data/packs/random_events/``, where each NPC asks about its own
subject -- the Sandwich Lady about cooking, Dr Jekyll about potions.

The host's questions used to be rounds of their own, placed by ``settings.order``: first
"mixed into the round of their own type", then, once a round was a mode rather than a
type, "wherever the custom round goes". Both were answers to where a host's question
belongs, and the answer turned out to be nowhere in particular, which is the point of an
interruption. So ``order`` and the custom round went, and this is what replaced them.

T21's version of it was rare by construction -- one event per round, never the first --
and put a random face on a question borrowed from a mode the host had not picked, which
made for a Sandwich Lady asking a Drop Table question. Since T22 the frequency says how
many events a room gets, and a pack event is an NPC asking its own question.
"""

import random
from collections import Counter
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any

from app.modes import MODES
from app.questions.packs import EVENT_MODE, Pack
from app.random_events import RANDOM_EVENTS
from app.rooms.settings import EVENT_EVERY, RoomSettings, event_windows


class TooManyEvents(ValueError):
    """More custom questions than the room has event slots.

    ``NewRoomSettings`` refuses that on the way in, counting the questions the host asked
    for in the order they were listed. This is the rarer case it cannot see: a mode whose
    pool ran short gives fewer round questions than it asked for, and so fewer slots, and
    rounds shuffled into another order can put more one-question rounds in one window.
    """


@dataclass(frozen=True, slots=True)
class Round:
    """One block of questions of one mode, introduced by its own splash.

    A random event inside it is a question of another mode, carrying ``random_event``: the
    id of the NPC asking it. An NPC's own question arrives with that key already, from its
    file; a host's question may name one; everything else gets a face drawn here. It is not
    in the content id, and it becomes the ``questions.random_event`` column rather than
    part of the stored payload. ``mode`` is the round's, never an event's.
    """

    mode: str
    questions: list[dict[str, Any]]


@dataclass(frozen=True, slots=True)
class _Slot:
    """Where one event goes: straight after question ``after`` of round ``round``."""

    round: int
    after: int


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
    appears twice in a room, the events included. A mode whose pool runs dry gives a short
    round, or none at all: an empty round is dropped rather than played, because a splash
    for a round with no questions is a screen that introduces nothing.

    A pool is every pack question carrying that ``mode``, never that ``type``. Modes share
    types -- five of them will be ``multiple_choice`` -- and pooling by type would have
    each of those rounds drawing the other four's questions. The NPCs' questions are the
    ``random_event`` pool, which no round draws from.
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

    return place_random_events(rounds, custom, pools.get(EVENT_MODE, []), settings, rng)


def place_random_events(
    rounds: Sequence[Round],
    custom: Sequence[dict[str, Any]],
    events: Sequence[dict[str, Any]],
    settings: RoomSettings,
    rng: random.Random,
) -> list[Round]:
    """Interrupt ``rounds`` with the host's questions and the NPCs' own.

    **Where.** The round questions, in play order, are cut into consecutive windows of
    ``EVENT_EVERY[frequency]``, and each whole window is one slot, at a position drawn
    inside it. That spaces the events through the game rather than bunching them, and it
    reaches a one-mode room, which one-per-round-after-the-first never did. A slot goes
    straight after a question that is not its round's last, so an event is always in the
    middle of a round: never the game's first question, never a round's first -- that one
    is the splash's -- and never followed by a round's first question either, so no splash
    ever comes straight after an interruption. A window with no such position (every
    round in it one question long) has no slot.

    **What.** The host's questions take random slots, in the order they were written;
    ``TooManyEvents`` if there are fewer slots than questions, because dropping the rest is
    the one thing a host must never find out about during the game. Every slot left takes
    one of ``events``, the NPCs' own questions, drawn without replacement: preferring a type
    the interrupted round does not play -- another four-button question in the middle of a
    four-button round reads as a long round, not an interruption -- and left empty only
    when no question qualifies.

    **Who.** A host's question that names its NPC gets that NPC, even one another question
    already named. Every other face is drawn from the NPCs the room has not seen yet, then
    from the least seen, and never the face of the event just before or just after it: a
    face the host named counts as seen from the start, so the draw does not spend it early.
    A host's question may be asked by anyone on the roster; an NPC's own question comes
    with its NPC, so for a pack slot the face and the question are drawn together, from the
    NPCs with questions left.

    Returns new rounds; ``rounds`` and the questions in it are left as they were.
    """
    slots = _slots(rounds, settings, rng)
    if len(custom) > len(slots):
        raise TooManyEvents(
            f"{len(custom)} custom questions, but this room drew only"
            f" {sum(len(r.questions) for r in rounds)} round questions, which make room for"
            f" {len(slots)} random events"
        )
    asked: dict[_Slot, dict[str, Any] | None] = dict.fromkeys(slots)
    taken = sorted(rng.sample(slots, len(custom)), key=_order)
    for slot, question in zip(taken, custom, strict=True):
        asked[slot] = question
    left = list(events)

    seen = Counter(q["random_event"] for q in custom if q.get("random_event") is not None)
    placed: dict[_Slot, dict[str, Any]] = {}
    previous: str | None = None
    for index, slot in enumerate(slots):
        following = asked.get(slots[index + 1]) if index + 1 < len(slots) else None
        avoid = {previous, following.get("random_event") if following is not None else None}
        question = asked[slot]
        if question is not None and question.get("random_event") is not None:
            face = question["random_event"]
        elif question is not None:
            face = _face(RANDOM_EVENTS, seen, avoid, rng)
            if face is None:  # only a roster of fewer than three could leave nobody
                raise TooManyEvents("the random-event roster has no face left to draw")
            seen[face] += 1
        else:
            question = _npc_question(left, seen, avoid, MODES[rounds[slot.round].mode].types, rng)
            if question is None:
                continue
            face = question["random_event"]
            seen[face] += 1
        placed[slot] = {**question, "random_event": face}
        previous = face

    interrupted: list[Round] = []
    for number, round_ in enumerate(rounds):
        questions: list[dict[str, Any]] = []
        for at, question in enumerate(round_.questions):
            questions.append(question)
            event = placed.get(_Slot(number, at))
            if event is not None:
                questions.append(event)
        interrupted.append(Round(mode=round_.mode, questions=questions))
    return interrupted


def _order(slot: _Slot) -> tuple[int, int]:
    return (slot.round, slot.after)


def _slots(rounds: Sequence[Round], settings: RoomSettings, rng: random.Random) -> list[_Slot]:
    """Every event position this room has, in play order. See ``place_random_events``."""
    frequency = settings.random_event_frequency
    # Only a stored room can lack one, and selection only runs when a room is made.
    assert frequency is not None, "a room is created with a frequency"
    lengths = [len(round_.questions) for round_ in rounds]
    return [_Slot(*rng.choice(window)) for window in event_windows(lengths, EVENT_EVERY[frequency])]


def _face(
    candidates: Sequence[str], seen: Counter[str], avoid: set[str | None], rng: random.Random
) -> str | None:
    """The least-seen of ``candidates`` outside ``avoid``, drawn at random among equals."""
    allowed = [npc for npc in candidates if npc not in avoid]
    if not allowed:
        return None
    fewest = min(seen[npc] for npc in allowed)
    return rng.choice([npc for npc in allowed if seen[npc] == fewest])


def _npc_question(
    left: list[dict[str, Any]],
    seen: Counter[str],
    avoid: set[str | None],
    interrupted_types: frozenset[str],
    rng: random.Random,
) -> dict[str, Any] | None:
    """Draw an NPC's own question for a slot, and take it out of ``left``.

    The face comes first: of the NPCs with questions left, the least seen outside
    ``avoid``. The type preference only chooses among those, so it can never bring a face
    back while a fresher one is waiting. ``left`` is already shuffled, so the first
    question that fits is a random one.
    """
    npcs = sorted({q["random_event"] for q in left} - avoid)
    if not npcs:
        return None
    fewest = min(seen[npc] for npc in npcs)
    freshest = [npc for npc in npcs if seen[npc] == fewest]
    different = [
        npc
        for npc in freshest
        if any(q["random_event"] == npc and q["type"] not in interrupted_types for q in left)
    ]
    npc = rng.choice(different or freshest)
    theirs = [q for q in left if q["random_event"] == npc]
    question = next((q for q in theirs if q["type"] not in interrupted_types), theirs[0])
    left.remove(question)
    return question


def flatten(rounds: Sequence[Round]) -> list[tuple[int, dict[str, Any]]]:
    """``(round number, question)`` in play order, which is the order they are stored in.

    An event carries the number of the round it interrupts, which is what lets
    ``segments.py`` group it back into that round instead of splitting it in three.
    """
    return [(number, q) for number, round_ in enumerate(rounds) for q in round_.questions]
