"""The one way a script talks to the OSRS Wiki, on the wiki's terms.

The wiki allows automated access that says who is asking and does not hammer it. So every
request carries the operator's own User-Agent, never one naming this repo, or every
selfhoster would report as the upstream project. It comes from ``WIKI_USER_AGENT`` in the
environment or the repo's ``.env``, the file the app reads, and there is no default:
``connect()`` refuses without one before anything is sent. Requests are throttled to one a
second per process, across every host and every caller.

A script's offline flags never call ``connect()``, so they need no User-Agent.

Usage::

    wiki = connect()  # MissingUserAgent when unset
    mapping = wiki.get_json("https://prices.runescape.wiki/api/v1/osrs/mapping")
    png = wiki.get_bytes("https://oldschool.runescape.wiki/images/Bob_chathead.png")
"""

import json
import time
import urllib.request
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from pydantic_settings import BaseSettings, SettingsConfigDict

ENV_FILE = Path(__file__).resolve().parents[2] / ".env"
VARIABLE = "WIKI_USER_AGENT"
EXAMPLE = "jolly-boar-quiz-importer - yourname on Discord"
INTERVAL_SECONDS = 1.0
TIMEOUT_SECONDS = 30
# Far above any chathead or render; a body past it is something else, and is not kept.
MAX_BYTES = 5_000_000


class MissingUserAgent(RuntimeError):
    """``WIKI_USER_AGENT`` is unset, blank, or still the example."""


class TooLarge(ValueError):
    """A response body over ``MAX_BYTES``."""


class _Env(BaseSettings):
    model_config = SettingsConfigDict(env_file_encoding="utf-8", extra="ignore")

    wiki_user_agent: str = ""


def user_agent(env_file: Path | None = None) -> str:
    """The operator's User-Agent, from the environment or ``env_file`` (the repo's ``.env``)."""
    found = _Env(_env_file=env_file or ENV_FILE).wiki_user_agent.strip()  # type: ignore[call-arg]
    if not found or found == EXAMPLE:
        problem = "is not set" if not found else "is still the example: put your own name in it"
        raise MissingUserAgent(
            f"{VARIABLE} {problem}. The OSRS Wiki asks every script to say what it is and how"
            f" to reach whoever runs it. Set it in .env or the environment, for example:\n"
            f'  {VARIABLE}="{EXAMPLE}"'
        )
    return found


@dataclass
class Throttle:
    """At most one request per ``interval`` seconds, on an injectable clock."""

    interval: float = INTERVAL_SECONDS
    clock: Callable[[], float] = time.monotonic
    sleep: Callable[[float], None] = time.sleep
    last: float | None = field(default=None, init=False)

    def wait(self) -> None:
        """Block until a request may go, and count it as gone."""
        if self.last is not None:
            due = self.last + self.interval - self.clock()
            if due > 0:
                self.sleep(due)
        self.last = self.clock()


THROTTLE = Throttle()


@dataclass(frozen=True)
class Wiki:
    user_agent: str
    throttle: Throttle

    def get_json(self, url: str) -> Any:
        """``url`` fetched and parsed, after the throttle lets it go."""
        return json.loads(self.get_bytes(url).decode("utf-8"))

    def get_bytes(self, url: str) -> bytes:
        """``url``'s body, after the throttle lets it go. ``TooLarge`` past ``MAX_BYTES``."""
        self.throttle.wait()
        request = urllib.request.Request(url, headers={"User-Agent": self.user_agent})
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:  # noqa: S310
            body = response.read(MAX_BYTES + 1)
        if len(body) > MAX_BYTES:
            raise TooLarge(f"{url}: more than {MAX_BYTES} bytes")
        return body


def connect(env_file: Path | None = None) -> Wiki:
    """This process's wiki client. ``MissingUserAgent`` before any request if it has none."""
    return Wiki(user_agent(env_file), THROTTLE)
