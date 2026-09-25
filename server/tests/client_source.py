"""The client's source, for the tests that hold it to what the server and the specs say."""

from pathlib import Path

from app.config import REPO_ROOT

CLIENT_SRC = REPO_ROOT / "client" / "src"


def read(path: Path | str) -> str:
    """A client file's text; a relative ``path`` is taken from ``client/src``."""
    return (CLIENT_SRC / path).read_text(encoding="utf-8")
