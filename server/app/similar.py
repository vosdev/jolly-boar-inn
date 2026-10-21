"""How much a suggested question looks like one the game has, from 0 to 100.

A question is its prompt, with any quote, and its right answer, both in ``free_text``'s
normal form so case, punctuation and spacing never tell two apart. Prompts compare by the
Dice coefficient of their character trigrams, which forgives a reworded clause or a typo
where comparing words would not. Answers count as the same when they are equal in that
form (any accepted spelling of a free-text answer will do) and fall back to the trigrams
otherwise. The prompt weighs more: two questions asking the same thing are a duplicate
whatever their answers, and many different questions share an answer like "Yes" or "3".

Two rounds need their own rule. Odd One Out always asks the same thing, so its options are
the question, compared as a set so a shuffle is no disguise. Who's That NPC? asks the same
too, and its NPC is the whole question: the same NPC is 100, another 0. A pack question
names it by ``answer_id``; a suggestion only by name until the import finds its id.

Questions of different types share nothing but the prompt, so it alone decides.
"""

from collections.abc import Iterable
from dataclasses import dataclass
from typing import Any

from app.questions import vocab
from app.questions.normalize import normalize

PROMPT_WEIGHT = 0.7
# A warning, not a verdict: low enough to catch a reworded duplicate, high enough that a
# shared subject alone ("How much does a … cost?") stays under it.
THRESHOLD = 60
TOP = 3
OPTIONS_MODES = frozenset({"odd_one_out"})
NPC_MODE = "whos_that_npc"


@dataclass(frozen=True)
class Features:
    """What the score reads from one question, worked out once."""

    type: str
    mode: str | None
    prompt: frozenset[str]
    answers: frozenset[Any]
    answer: frozenset[str]
    options: frozenset[str]
    npc: Any


def _trigrams(text: str) -> frozenset[str]:
    padded = f"  {text} "
    return frozenset(padded[i : i + 3] for i in range(len(padded) - 2))


def dice(a: frozenset[str], b: frozenset[str]) -> float:
    """The Dice coefficient of two trigram sets: 1 for the same, 0 for nothing shared."""
    if not a and not b:
        return 1.0
    return 2 * len(a & b) / (len(a) + len(b))


def _answers(type_: str, payload: dict[str, Any]) -> tuple[frozenset[Any], str]:
    # Every form that counts as the same answer, and the text the trigrams fall back to.
    if type_ == "multiple_choice":
        right = normalize(payload["options"][payload["answer_index"]])
        return frozenset({right}), right
    if type_ == "pick_all_that_apply":
        right = frozenset(normalize(payload["options"][i]) for i in payload["answer_indices"])
        return frozenset({right}), " ".join(sorted(right))
    if type_ == "ordering":
        order = tuple(normalize(payload["entries"][i]["text"]) for i in payload["answer"])
        return frozenset({order}), " ".join(order)
    if type_ == "free_text":
        accepted = [normalize(answer) for answer in payload["accepted"]]
        return frozenset(accepted), accepted[0] if accepted else ""
    if type_ in ("closest_number", "number_slider"):
        return frozenset({float(payload["answer"])}), f"{payload['answer']:g}"
    if type_ == "pick_from_list":
        name = vocab.fold(_npc_name(payload))
        return frozenset({name}), name
    return frozenset(), ""


def _npc_name(payload: dict[str, Any]) -> str:
    subject = payload.get("subject")
    if subject is not None:
        return subject["name"]
    entries = vocab.get(payload.get("vocab", "npcs"))
    return (entries.name_of(payload["answer_id"]) if entries else None) or ""


def features(question: dict[str, Any]) -> Features:
    """A question, a pack's or a suggestion's content, as the score reads it."""
    type_, payload = question["type"], question["payload"]
    quote = payload.get("quote")
    prompt = payload["prompt"] if quote is None else f"{payload['prompt']} {quote}"
    answers, answer = _answers(type_, payload)
    npc = None
    if type_ == "pick_from_list":
        npc = (payload.get("answer_id"), vocab.fold(_npc_name(payload)))
    return Features(
        type=type_,
        mode=question.get("mode"),
        prompt=_trigrams(normalize(prompt)),
        answers=answers,
        answer=_trigrams(answer),
        options=frozenset(normalize(option) for option in payload.get("options", ())),
        npc=npc,
    )


def _same_npc(a: tuple[Any, str], b: tuple[Any, str]) -> bool:
    if a[0] is not None and b[0] is not None:
        return a[0] == b[0]
    return a[1] == b[1]


def score(a: Features, b: Features) -> int:
    """How alike two questions are, from 0 to 100."""
    if a.mode == b.mode == NPC_MODE:
        return 100 if _same_npc(a.npc, b.npc) else 0
    if a.mode == b.mode and a.mode in OPTIONS_MODES:
        union = a.options | b.options
        return round(100 * len(a.options & b.options) / len(union)) if union else 100
    prompt = dice(a.prompt, b.prompt)
    if a.type != b.type:
        return round(100 * prompt)
    answer = 1.0 if a.answers & b.answers else dice(a.answer, b.answer)
    return round(100 * (PROMPT_WEIGHT * prompt + (1 - PROMPT_WEIGHT) * answer))


def best[T](question: Features, candidates: Iterable[tuple[T, Features]]) -> list[tuple[int, T]]:
    """The ``TOP`` candidates scoring ``THRESHOLD`` or more, best first."""
    scored = [(score(question, found), key) for key, found in candidates]
    kept = sorted((pair for pair in scored if pair[0] >= THRESHOLD), key=lambda pair: -pair[0])
    return kept[:TOP]
