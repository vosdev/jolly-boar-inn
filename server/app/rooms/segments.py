"""A room's rounds, grouped from the questions themselves. Pure and testable.

A round is a run of consecutive questions carrying the same ``round`` number, which
``selection.select`` assigns and ``create`` persists. Grouping them here rather than
storing a second copy means the two can never disagree.

The round number is stored rather than derived because neither cheap derivation holds.
Counting questions off the settings — a mode is a round, so a round is that mode's
``questions`` — fails as soon as a round is short, which happens when a mode runs out of
pack questions and will happen again when Phase 2 lets a room carry custom questions. Runs
of equal ``mode`` fail on the trailing rounds those custom questions get. Both failures are
silent, and both show players the wrong mode on the splash.

A segment is named for its questions' ``mode``, not their ``type``: two rounds may play
the same answer shape, and it is the mode the splash introduces and the client looks up.
"""

from collections.abc import Sequence
from typing import Protocol

from app.ws.protocol import Segment


class _Grouped(Protocol):
    """The two fields grouping needs: ``RoomQuestion`` and anything shaped like it."""

    round: int
    mode: str


def segments_of(questions: Sequence[_Grouped]) -> list[Segment]:
    """One ``Segment`` per run of equal ``round``, in position order.

    ``questions`` is the room's list, ordered by position; the index into it is the
    position, which is what ``Segment.start`` reports.
    """
    segments: list[Segment] = []
    for position, question in enumerate(questions):
        if segments and questions[position - 1].round == question.round:
            previous = segments[-1]
            segments[-1] = previous.model_copy(update={"count": previous.count + 1})
            continue
        segments.append(
            Segment(
                mode=question.mode,
                index=len(segments),
                total=0,  # filled in below, once we know how many rounds there are
                start=position,
                count=1,
            )
        )
    return [segment.model_copy(update={"total": len(segments)}) for segment in segments]


def segment_at(segments: Sequence[Segment], position: int) -> Segment | None:
    """The round ``position`` falls in, or ``None`` if it falls outside every round."""
    for segment in segments:
        if segment.start <= position < segment.start + segment.count:
            return segment
    return None
