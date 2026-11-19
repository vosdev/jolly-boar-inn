"""Whether a restart would cut anyone off: list live rooms, exit 1 while any is active.

A room is active in the lobby or playing with someone connected. A finished room in its grace,
a lobby nobody is in and a room brought back after a restart that nobody has rejoined are not:
a restart costs them nothing a player is watching.

Reads ``GET /api/admin/rooms`` with ``ADMIN_TOKEN`` from the environment as a bearer header,
so the token never reaches a URL. ``make rooms`` and ``make deploy`` run it in the app
container, where that token and the server already are:

    python scripts/rooms.py [--url URL] [--wait SECONDS] [--every SECONDS]

Exit codes: 0 quiet, 1 active rooms (listed), 2 the server or the token failed, so an error is
never read as quiet. ``--wait`` polls until quiet or the time runs out.
"""

import argparse
import os
import sys
import time
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

import httpx

QUIET, ACTIVE, FAILED = 0, 1, 2
ADMIN_ROOMS = "/api/admin/rooms"


class CheckFailed(Exception):
    """The room list could not be read."""


@dataclass(frozen=True)
class ActiveRoom:
    code: str
    status: str
    round: str | None
    connected: int

    def line(self) -> str:
        """One row of the report."""
        where = f"round {self.round}" if self.round else "-"
        return f"{self.code:<20} {self.status:<8} {where:<28} {self.connected} connected"


def active(rooms: list[dict[str, Any]]) -> list[ActiveRoom]:
    """The rooms a restart would interrupt, playing ones first."""
    found = [
        ActiveRoom(
            code=room["code"],
            status=room["status"],
            round=None
            if room["round"] is None
            else f"{room['round']['index'] + 1}/{room['round']['total']} {room['round']['mode']}",
            connected=room["connected"],
        )
        for room in rooms
        if room["status"] in ("lobby", "playing") and room["connected"] > 0
    ]
    return sorted(found, key=lambda room: room.status != "playing")


def fetch(client: httpx.Client, token: str) -> list[dict[str, Any]]:
    """The live rooms, or ``CheckFailed`` saying why not."""
    if not token:
        raise CheckFailed("ADMIN_TOKEN is not set")
    try:
        response = client.get(ADMIN_ROOMS, headers={"Authorization": f"Bearer {token}"})
    except httpx.HTTPError as error:
        raise CheckFailed(f"cannot reach the server: {error}") from error
    if response.status_code == 404:
        raise CheckFailed("the admin API is off: the server has no ADMIN_TOKEN")
    if response.status_code == 401:
        raise CheckFailed("the server refused ADMIN_TOKEN")
    if response.status_code != 200:
        raise CheckFailed(f"{ADMIN_ROOMS} answered {response.status_code}")
    rooms: list[dict[str, Any]] = response.json()["rooms"]
    return rooms


def check(
    client: httpx.Client,
    token: str,
    wait: float = 0,
    every: float = 60,
    out: Callable[[str], None] = print,
    sleep: Callable[[float], None] = time.sleep,
    clock: Callable[[], float] = time.monotonic,
) -> int:
    """Report active rooms, polling up to ``wait`` seconds for quiet; the exit code."""
    deadline = clock() + wait
    while True:
        try:
            rooms = active(fetch(client, token))
        except CheckFailed as error:
            out(f"error: {error}")
            return FAILED
        if not rooms:
            out("No active rooms.")
            return QUIET
        playing = sum(room.status == "playing" for room in rooms)
        out(f"{len(rooms)} active rooms: {playing} playing, {len(rooms) - playing} in the lobby.")
        for room in rooms:
            out(room.line())
        left = deadline - clock()
        if left <= 0:
            return ACTIVE
        out(f"Checking again in {min(every, left):.0f} s.")
        sleep(min(every, left))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--url", default=os.environ.get("JBI_URL", "http://127.0.0.1:8000"))
    parser.add_argument("--wait", type=float, default=0, help="seconds to poll for quiet")
    parser.add_argument("--every", type=float, default=60, help="seconds between polls")
    args = parser.parse_args()
    with httpx.Client(base_url=args.url, timeout=10) as client:
        return check(client, os.environ.get("ADMIN_TOKEN", ""), args.wait, args.every)


if __name__ == "__main__":
    sys.exit(main())
