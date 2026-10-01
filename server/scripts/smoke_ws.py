"""Container smoke test: a room, a websocket, the splash's ready check, and the first question.

What the `curl` checks in CI cannot reach. Everything here is specific to the built
image rather than to the code: uvicorn serving `/ws/{code}` with `--proxy-headers`,
`PACKS_DIR` resolving against the runtime working directory, and the migrations having
run far enough for a room to hold questions.

Runs inside the app container (`docker compose exec app python scripts/smoke_ws.py`),
so it talks to 127.0.0.1 rather than through the published port; the published port is
what the `curl` checks next to it already prove.

Not a game-loop test. `server/tests/` owns that, against a process pytest started.
"""

import asyncio
import json
import sys
import urllib.error
import urllib.request

BASE = "http://127.0.0.1:8000"
WS = "ws://127.0.0.1:8000"
TIMEOUT = 10


def create_room() -> tuple[str, str]:
    body = json.dumps(
        {
            "display_name": "Smoke",
            "returning": False,
            "settings": {"modes": [{"mode": "more_less", "questions": 2, "seconds": 5}]},
            "custom_questions": [],
        }
    ).encode()
    request = urllib.request.Request(
        f"{BASE}/api/rooms", data=body, headers={"content-type": "application/json"}
    )
    with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
        created = json.load(response)
    return created["code"], created["session"]


async def expect(socket, want: str) -> dict:
    """The next frame, which must be `want`. Anything else fails the build."""
    raw = await asyncio.wait_for(socket.recv(), timeout=TIMEOUT)
    message = json.loads(raw)
    if message["t"] != want:
        raise SystemExit(f"expected {want}, got {message['t']}: {raw}")
    return message


async def main() -> None:
    import websockets  # ships with uvicorn[standard]; absent from the CI runner

    code, session = create_room()
    print(f"created room {code}")

    async with websockets.connect(f"{WS}/ws/{code}") as socket:
        await socket.send(json.dumps({"t": "hello", "session": session}))
        welcome = await expect(socket, "welcome")
        if welcome["room"]["total"] != 2:
            raise SystemExit(f"room holds {welcome['room']['total']} questions, wanted 2")
        print(f"welcome: {welcome['room']['total']} questions, phase {welcome['room']['phase']}")

        # start_game proves the packs loaded: a room with no questions never opens one.
        # The default settings introduce the round, and since D7 a splash has no clock:
        # it waits for the room. The only player tapping ready is everyone ready, which
        # opens the question three seconds later.
        await socket.send(json.dumps({"t": "start_game"}))
        tapped = False
        while True:
            message = json.loads(await asyncio.wait_for(socket.recv(), timeout=TIMEOUT))
            if message["t"] == "question_open":
                break
            if message["t"] == "error":
                raise SystemExit(f"start_game refused: {message}")
            if message["t"] == "room_updated" and message["room"]["phase"] == "splash":
                if not tapped:
                    await socket.send(json.dumps({"t": "ready", "ready": True}))
                    print("splash: tapped ready")
                    tapped = True
        question = message["question"]
        print(f"question {question['index'] + 1}/{question['total']} open, type {question['type']}")

    print("websocket smoke test passed")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except (TimeoutError, urllib.error.URLError, OSError) as exc:
        sys.exit(f"smoke test could not reach the app: {exc}")
