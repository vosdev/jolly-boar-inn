"""The teams of a team game: the gods, named once on the server, in the order every list of
them takes. The client's ``lib/teams.ts`` names the same six in the same order.
"""

from typing import Literal, get_args

God = Literal["saradomin", "zamorak", "guthix", "armadyl", "bandos", "zaros"]

GODS: tuple[God, ...] = get_args(God)

# Fewer than two teams is not a team game; more than six has no god left to give.
MIN_TEAMS = 2
MAX_TEAMS = len(GODS)
