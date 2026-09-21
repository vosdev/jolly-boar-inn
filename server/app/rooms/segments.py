"""A room's rounds, grouped from the questions themselves. Pure and testable.

A round is a run of consecutive questions carrying the same ``round`` number, which
``selection.select`` assigns and ``create`` persists. Grouping them here rather than
storing a second copy means the two can never disagree.

The round number is stored rather than derived because neither cheap derivation holds.
Counting questions off the settings — a mode is a round, so a round is that mode's
``questions`` — fails as soon as a round is short, which happens when a mode runs out of
pack questions, and when a random event makes one longer. Runs of equal ``mode`` fail on
the random event itself: a question of one mode sitting inside a round of another. Both
failures are silent, and both show players the wrong mode on the splash.

A random event carries the ``round`` of the round it interrupts, so it is grouped into
that round: a ``custom`` question at position 5 of a ``more_less`` round leaves one round,
not three. The segment's ``mode`` comes from the questions that are not events. An event
is never a round's first question, so that is the first question in practice; the rule is
written out anyway, because a segment named for its event would introduce the wrong round.

A segment is named for its questions' ``mode``, not their ``type``: two rounds may play
the same answer shape, and it is the mode the splash introduces and the client looks up.
"""

from collections.abc import Sequence
from typing import Protocol

from app.ws.protocol import Segment


class _Grouped(Protocol):
    """The fields grouping needs: ``RoomQuestion`` and anything shaped like it."""

    round: int
    mode: str
    random_event: str | None


def segments_of(questions: Sequence[_Grouped]) -> list[Segment]:
    """One ``Segment`` per run of equal ``round``, in position order.

    ``questions`` is the room's list, ordered by position; the index into it is the
    position, which is what ``Segment.start`` reports.
    """
    segments: list[Segment] = []
    # Whether each segment's mode came from a question that is not an event.
    named: list[bool] = []
    for position, question in enumerate(questions):
        own = question.random_event is None
        if segments and questions[position - 1].round == question.round:
            previous = segments[-1]
            update: dict[str, object] = {"count": previous.count + 1}
            if own and not named[-1]:
                update["mode"] = question.mode
                named[-1] = True
            segments[-1] = previous.model_copy(update=update)
            continue
        named.append(own)
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
