"""``Mode``: one round a host can pick, the question types it is answered in, and its rules.

Its own module rather than a class in ``modes/__init__.py`` for the same reason ``Bounds``
has one: a test's stub mode, or anything else that needs the shape, should not have to
import the registry to get it.
"""

from dataclasses import dataclass, replace
from typing import Literal

from app.questions.types.bounds import Bounds
from app.questions.types.scoring import Steps

# How the report form offers and names a mode's questions: ``item`` from the roster rather
# than the pack, ``options`` by its options since every prompt is the same, ``npc`` by the
# NPC a render shows and with the NPC a shadow is.
Report = Literal["question", "item", "options", "npc"]
# What makes two of a mode's questions the same, before prompts and answers: ``item`` the
# same item, ``options`` the same options in any order, ``npc`` the same NPC and nothing else.
Compare = Literal["question", "item", "options", "npc"]


@dataclass(frozen=True, slots=True)
class Suggest:
    """What a player may suggest for a mode (``app/suggestions.py``), and how it is held.

    ``types`` are what its editor offers; ``None`` means the mode's own. ``quote`` and
    ``intro`` allow those payload fields, and ``explanation`` and ``difficulty`` say whether
    the mode takes one. ``fixed_prompt`` is the one thing every question asks. ``wiki_only``
    takes a wiki page and nothing else as proof. ``named`` is the list a ``pick_from_list``
    answer is named on, by name, for the import script to find; ``verse`` makes the prompt
    the player's own, about an item that may be listed already. ``render`` names an NPC as a
    ``multiple_choice`` right option, for the import script to picture. ``picture_item``
    takes an item's name to picture, ``lined`` a prompt of several lines, ``clued`` the
    mode's clues, vaguest first. ``picture`` takes the suggester's own screenshot, which is
    then the proof in place of a link, and every question of the round carries one. ``minimap``
    takes a spot on the map, turned, for a minimap baked from the tiles. ``tags`` are the
    pack's tags a question of each type gets, as ``(type, tag)`` pairs. ``right_first`` is a
    pack that lists the right option first and asks each prompt once.
    """

    types: frozenset[str] | None = None
    quote: bool = False
    intro: bool = False
    explanation: bool = True
    difficulty: bool = True
    fixed_prompt: str | None = None
    wiki_only: bool = False
    named: str | None = None
    verse: bool = False
    render: bool = False
    picture_item: bool = False
    lined: bool = False
    clued: bool = False
    picture: bool = False
    minimap: bool = False
    tags: tuple[tuple[str, str], ...] = ()
    right_first: bool = False

    def __post_init__(self) -> None:
        if self.types is not None:
            object.__setattr__(self, "types", frozenset(self.types))


@dataclass(frozen=True, slots=True)
class Mode:
    """One entry in ``MODES``.

    ``id`` is what ``questions.mode`` and ``settings.modes[].mode`` hold. ``types`` are the
    keys into ``questions/types`` its questions may use: the answer shapes, and so what
    grades them. Most rounds have one; a round may mix several, since every question
    carries its own type and the game loop only ever reads that.

    ``is_round`` is stated rather than derived from ``types``, so that forgetting a type
    cannot quietly turn a round into something no host can pick. The two modes that are
    not rounds, ``custom`` (the host's own questions) and ``random_event`` (the NPCs'), are
    pools of random events: each of their questions carries a type of its own, so they
    state no types and no question count.

    ``pool`` names the mode whose pack questions this round draws instead of its own, so
    ``random_events_only`` can play the NPCs' questions as a round. ``setting`` names the
    boolean ``Settings`` field that has to be on for a host to pick the mode: the way a
    round that is not ready for everyone is kept off a public instance.

    ``questions`` is how many questions a round holds, when it disagrees with its types.
    ``None`` means "whatever the types say", which is what ``questions_bounds`` falls back
    to; a round whose types disagree must state it, which ``modes.problems`` checks. How
    long a question lasts is its type's (``types/timing.py``); ``extra_answer`` adds seconds to
    the answer, before the pace, for a round whose questions take longer to read.

    ``options`` bounds how many options its ``multiple_choice`` questions offer, when the
    schema's two to six would make the round a guess.

    ``steps`` is how a round's picture builds up, for its ``STEP`` questions; without it they
    score on speed. ``clues`` is how many clues each question carries, one shown a step, so a
    clued mode's steps count as many; 0 for a round whose questions carry none. ``described``
    makes the prompt a description of its one place that never names it, with an
    ``explanation`` that ties the two for the reveal. ``pictured``
    keeps a question whose picture this install lacks out of the round: the picture is the
    whole question. ``picture_at_reveal`` holds a question's picture
    back until it closes, for a round where the picture would give the answer away.
    ``map_icons`` draws the game's map icons over a ``map_pin`` map while it is open; every
    map shows them at the reveal, so a round where they would help too much keeps them off.
    ``map_labels`` does the same with the game's place names, which can be the answer.

    ``stem`` is what the client draws above the answers (``lib/modes/``), or ``None`` for a
    mode its view alone draws; ``rooms/hold.py`` reads it to count the letters typed.
    ``hold_counts_prompt`` has the hold count the prompt although ``stem`` is ``None``: the
    server's guess for Pixel Hunt, which the client does not type.

    ``suggest`` is how a player may suggest a question for it, ``None`` for not at all.
    ``report`` is how the report form offers its questions, ``compare`` what makes two of
    them the same to ``app/similar.py``.
    """

    id: str
    types: frozenset[str]
    is_round: bool = True
    questions: Bounds | None = None
    pool: str | None = None
    setting: str | None = None
    options: tuple[int, int] | None = None
    steps: Steps | None = None
    clues: int = 0
    described: bool = False
    pictured: bool = False
    picture_at_reveal: bool = False
    map_icons: bool = False
    map_labels: bool = False
    extra_answer: int = 0
    stem: str | None = "text"
    hold_counts_prompt: bool = False
    suggest: Suggest | None = None
    report: Report = "question"
    compare: Compare = "question"

    def __post_init__(self) -> None:
        # A bare string would be read as a set of its letters.
        if isinstance(self.types, str):
            raise TypeError(f"{self.id}: types must be a collection of type ids, not a str")
        object.__setattr__(self, "types", frozenset(self.types))
        if self.suggest is not None and self.suggest.types is None:
            object.__setattr__(self, "suggest", replace(self.suggest, types=self.types))
