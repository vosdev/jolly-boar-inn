"""The teams of a team game: the gods, named once on the server, in the order every list of
them takes. The client's ``lib/teams.ts`` names the same six in the same order.
"""

from typing import Literal, get_args

God = Literal["saradomin", "zamorak", "guthix", "armadyl", "bandos", "zaros"]

GODS: tuple[God, ...] = get_args(God)

# Fewer than two teams is not a team game; more than six has no god left to give.
MIN_TEAMS = 2
MAX_TEAMS = len(GODS)


def check_teams(teams: list[str]) -> list[God]:
    """``teams`` as a team game's gods: 2 to 6 distinct ones in ``GODS`` order, else ValueError."""
    if not MIN_TEAMS <= len(teams) <= MAX_TEAMS:
        raise ValueError(f"a team game has {MIN_TEAMS}..{MAX_TEAMS} gods, not {len(teams)}")
    if unknown := [team for team in teams if team not in GODS]:
        raise ValueError(f"{unknown[0]!r} is not a god")
    if len(set(teams)) != len(teams):
        raise ValueError("teams must be distinct: a god is one team")
    if teams != [god for god in GODS if god in teams]:
        raise ValueError(f"teams must be listed in the order {list(GODS)}")
    return [god for god in GODS if god in teams]
