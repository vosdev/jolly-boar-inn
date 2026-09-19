"""``Bounds``: a per-mode number, its default and the range a host may set it to.

Its own module rather than a name in ``types/__init__.py`` because every type module
needs it and ``types/__init__.py`` imports every type module: the registry importing
``more_less`` while ``more_less`` imports the registry is a cycle, and this is the
smallest thing to lift out of it.
"""

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class Bounds:
    """What the create form offers for one per-mode setting, and what it accepts.

    ``default`` is the sane starting point a host sees; ``minimum`` and ``maximum`` are
    the policy about what they may change it to, checked by ``NewRoomSettings`` where the
    request arrives. ``clamp`` is the same policy applied to a number already stored: a
    room created under one set of bounds keeps loading after they change.
    """

    default: int
    minimum: int
    maximum: int

    def __post_init__(self) -> None:
        if not self.minimum <= self.default <= self.maximum:
            raise ValueError(f"default {self.default} is outside {self.minimum}..{self.maximum}")

    def holds(self, value: int) -> bool:
        return self.minimum <= value <= self.maximum

    def clamp(self, value: int) -> int:
        return max(self.minimum, min(self.maximum, value))

    def view(self) -> dict[str, int]:
        """``GET /api/modes``: what the create form needs to render one number field."""
        return {"default": self.default, "min": self.minimum, "max": self.maximum}
