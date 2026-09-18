"""A player's submitted answer, as handed to ``types.<type>.grade``."""

from dataclasses import dataclass
from typing import Any
from uuid import UUID


@dataclass(frozen=True, slots=True)
class Submission:
    player_id: UUID
    value: Any
