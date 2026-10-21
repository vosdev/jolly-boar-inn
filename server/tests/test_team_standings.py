"""A team game's standings: each team's members' points averaged and rounded, ranked dense
in ``settings.teams`` order, with the players' rule for what a round gained and where a team
stood before it. They ride every frame the players' standings ride."""

from typing import Any

from app.rooms.models import Totals
from tests.game_api import Game, updated

THREE = ["saradomin", "zamorak", "guthix", "armadyl"]


def seat_teams(game: Game, teams: dict[str, str]) -> None:
    """Put each named seat on its god; a seat not named stays teamless."""
    for seat in game.seats:
        if seat.name in teams:
            seat.send(t="set_team", team=teams[seat.name])
            seat.settle()


def two_rounds(second_mode: str) -> dict[str, Any]:
    return {
        "seconds": 10,
        "close_when_all_answered": False,
        "standings_seconds": 30,
        "modes": [
            {"mode": "more_less", "questions": 1},
            {"mode": second_mode, "questions": 1},
        ],
    }


def by_team(standings: list[dict[str, Any]]) -> list[tuple[str, int, int, int, int | None]]:
    return [
        (s["team"], s["points"], s["rank"], s["points_gained"], s["previous_rank"])
        for s in standings
    ]


def play(game: Game, index: int, right: list[str], wrong: list[str]) -> dict[str, Any]:
    """Question ``index``: ``right`` answer right, ``wrong`` wrong, the rest stay silent."""
    game.opened(index)
    for seat in game.seats:
        if seat.name in right or seat.name in wrong:
            game.answer(seat, index, game.right(index) if seat.name in right else game.wrong(index))
            seat.take("answer_ack")
    game.skip()
    return game.admin.take("question_closed")


def test_three_of_four_right_on_multiple_choice_gives_the_team_750(table) -> None:
    game = table(
        "Zezima",
        "Woox",
        "Lynx",
        "Silent",
        teams=["saradomin", "zamorak"],
        seconds=10,
        close_when_all_answered=False,
        modes=[{"mode": "who_said_that", "questions": 1}],
    )
    seat_teams(
        game,
        {
            "Admin": "zamorak",
            "Zezima": "saradomin",
            "Woox": "saradomin",
            "Lynx": "saradomin",
            "Silent": "saradomin",
        },
    )
    game.start()
    assert game.question(0).type == "multiple_choice"
    closed = play(game, 0, right=["Zezima", "Woox", "Lynx"], wrong=[])
    assert by_team(closed["team_standings"]) == [
        ("saradomin", 750, 1, 750, None),
        ("zamorak", 0, 2, 0, None),
    ]


def test_a_silent_member_counts_as_zero(table) -> None:
    game = table(
        "Zezima",
        "Woox",
        "Silent",
        teams=["saradomin", "zamorak"],
        seconds=10,
        close_when_all_answered=False,
    )
    seat_teams(
        game, {"Admin": "zamorak", "Zezima": "zamorak", "Woox": "saradomin", "Silent": "saradomin"}
    )
    game.start()
    closed = play(game, 0, right=["Zezima", "Woox"], wrong=["Admin"])
    assert by_team(closed["team_standings"]) == [
        ("saradomin", 500, 1, 500, None),
        ("zamorak", 500, 1, 500, None),
    ]


def test_an_average_rounds_half_up(table) -> None:
    game = table("Zezima", "Woox", teams=["saradomin", "zamorak"])
    seat_teams(game, {"Admin": "saradomin", "Zezima": "saradomin", "Woox": "zamorak"})
    room = game.room
    ids = {p.display_name: p.id for p in room.players.values()}
    room.totals = {ids["Admin"]: Totals(points=1001), ids["Zezima"]: Totals(points=0)}
    assert (room.team_standings() or [])[0].points == 501
    room.totals[ids["Zezima"]] = Totals(points=2)
    assert (room.team_standings() or [])[0].points == 502


def _two_round_team_game(table, second_mode: str) -> tuple[Game, list[list[Any]]]:
    """Round one: Saradomin 1000, Zamorak 500, Guthix 0. Round two: Zamorak draws level."""
    game = table("Zezima", "Woox", "Lynx", teams=THREE, **two_rounds(second_mode))
    seat_teams(
        game, {"Admin": "guthix", "Zezima": "saradomin", "Woox": "zamorak", "Lynx": "zamorak"}
    )
    game.start()
    first = play(game, 0, right=["Zezima", "Woox"], wrong=["Lynx"])
    standings = updated(game.admin, lambda m: m["room"]["phase"] == "standings")
    game.skip()
    second = play(game, 1, right=["Lynx"], wrong=["Zezima", "Woox"])
    return game, [first["team_standings"], standings["team_standings"], second["team_standings"]]


def test_ranks_gains_and_previous_ranks_over_two_rounds_with_a_tie(table, second_mode) -> None:
    """Armadyl has nobody and is left out; the tie keeps ``settings.teams`` order."""
    game, (first, between, second) = _two_round_team_game(table, second_mode)
    assert by_team(first) == [
        ("saradomin", 1000, 1, 1000, None),
        ("zamorak", 500, 2, 500, None),
        ("guthix", 0, 3, 0, None),
    ]
    assert between == first
    assert by_team(second) == [
        ("saradomin", 1000, 1, 0, 1),
        ("zamorak", 1000, 1, 500, 2),
        ("guthix", 0, 2, 0, 3),
    ]
    assert game.admin.take("game_finished")["team_standings"] == second


def test_every_standings_frame_carries_them_in_a_team_game(
    table, client, second_mode, evict
) -> None:
    game, (_, _, second) = _two_round_team_game(table, second_mode)
    final = game.admin.take("game_finished")["team_standings"]
    assert final == second
    with client.websocket_connect(f"/ws/{game.code}") as again:
        again.send_json({"t": "hello", "session": game.players[0].session})
        assert again.receive_json()["team_standings"] == final
    assert evict(game.code) is True
    with client.websocket_connect(f"/ws/{game.code}") as again:
        again.send_json({"t": "hello", "session": game.players[0].session})
        welcome = again.receive_json()
        assert welcome["t"] == "welcome"
        assert welcome["team_standings"] == final


def test_a_game_without_teams_sends_none(table, second_mode) -> None:
    game = table("Zezima", **two_rounds(second_mode))
    game.start()
    closed = play(game, 0, right=["Zezima"], wrong=[])
    assert closed["team_standings"] is None
    standings = updated(game.admin, lambda m: m["room"]["phase"] == "standings")
    assert standings["standings"] and standings.get("team_standings") is None
    game.skip()
    play(game, 1, right=[], wrong=[])
    assert game.admin.take("game_finished")["team_standings"] is None
    with game.client.websocket_connect(f"/ws/{game.code}") as again:
        again.send_json({"t": "hello", "session": game.players[0].session})
        assert again.receive_json()["team_standings"] is None
