"""The committed protocol schema is what the models produce, and says what the wire carries."""

from typing import Any

import pytest

from app.rooms.settings import RoomSettings
from app.ws import protocol
from app.ws.schema import REGENERATE, SCHEMA_PATH, protocol_schema, render

DEFS: dict[str, Any] = protocol_schema()["$defs"]


def test_committed_schema_is_current() -> None:
    assert SCHEMA_PATH.read_text(encoding="utf-8") == render(), (
        f"{SCHEMA_PATH.name} is stale: run `{REGENERATE}` and commit the result"
    )


@pytest.mark.parametrize(
    "model",
    [protocol.RoomView, protocol.OpenQuestion, protocol.QuestionClosed, protocol.SetProfile],
)
def test_every_field_is_described(model: type[protocol.BaseModel]) -> None:
    assert list(DEFS[model.__name__]["properties"]) == list(model.model_fields)


def test_server_defaults_are_required() -> None:
    welcome = DEFS["Welcome"]
    assert "t" in welcome["required"]
    assert {"answered", "of", "picture", "random_event"} <= set(DEFS["OpenQuestion"]["required"])


@pytest.mark.parametrize(
    ("model", "field", "type_"),
    [
        ("RoomView", "rounds", "integer"),
        ("RoomView", "key", "string"),
        ("RoomView", "requests", "array"),
        ("RoomUpdated", "standings", "array"),
        ("QuestionClosed", "suggested_by", "string"),
        ("RoomSettings", "hide_rounds", "boolean"),
        ("RoomSettings", "surprise_modes", "integer"),
    ],
)
def test_left_out_fields_are_optional_and_never_null(model: str, field: str, type_: str) -> None:
    shape = DEFS[model]
    assert field not in shape["required"]
    assert shape["properties"][field]["type"] == type_
    assert "anyOf" not in shape["properties"][field]


def test_client_defaults_are_optional() -> None:
    assert DEFS["SetProfile"]["required"] == ["t"]


def test_both_unions_name_every_message() -> None:
    client = {ref["$ref"].rsplit("/", 1)[1] for ref in DEFS["ClientMessage"]["oneOf"]}
    server = {ref["$ref"].rsplit("/", 1)[1] for ref in DEFS["ServerMessage"]["anyOf"]}
    assert client == {
        "Hello",
        "Ping",
        "Answer",
        "StartGame",
        "Skip",
        "Promote",
        "Kick",
        "EndGame",
        "EndRound",
        "RotateKey",
        "DecideRequest",
        "SetProfile",
        "Ready",
        "SetTeam",
        "MoveTeam",
        "SetTeams",
        "Editing",
    }
    assert "Error" in server and "Welcome" in server


def test_field_docstrings_reach_the_schema() -> None:
    assert DEFS["PlayerView"]["properties"]["ready"]["description"].startswith("The ready check")
    assert RoomSettings.model_fields["pace"].description
