"""``schema/protocol.schema.json``: the JSON Schema of every websocket message, both directions.

The client generates its protocol types from this file (``client/gen-protocol.ts``), so a
field renamed here is a compile error there rather than an ``undefined`` mid-game. A test
fails when the committed file differs from what the models produce.
"""

import json
from pathlib import Path
from typing import Any

from pydantic import TypeAdapter
from pydantic.json_schema import GenerateJsonSchema

from app.ws.protocol import ClientMessage, ServerMessage

SCHEMA_PATH = Path(__file__).resolve().parents[3] / "schema" / "protocol.schema.json"
REGENERATE = "make gen-protocol"


class _WireSchema(GenerateJsonSchema):
    """Describes what crosses the wire, not what Python accepts.

    A server message always carries its defaulted fields, so they are required, ``t``
    included; only an ``exclude_if`` field can be missing, and then it is missing rather
    than null. A client message is what the server accepts, so there a default does make
    a field optional. Field names are not titles: the generator would make every titled
    property a named type.
    """

    def field_is_required(self, field: Any, total: bool) -> bool:
        if self.mode == "serialization":
            return field.get("serialization_exclude_if") is None
        return super().field_is_required(field, total)

    def field_title_should_be_set(self, schema: Any) -> bool:
        return False

    def model_schema(self, schema: Any) -> Any:
        model = super().model_schema(schema)
        if self.mode == "serialization":
            required = set(model.get("required", ()))
            for name, prop in model.get("properties", {}).items():
                if name not in required:
                    _drop_null(prop)
        return model


def _drop_null(prop: dict[str, Any]) -> None:
    """An ``exclude_if`` field left out when it is None never arrives as null."""
    variants = prop.get("anyOf")
    if variants is None or {"type": "null"} not in variants:
        return
    rest = [variant for variant in variants if variant != {"type": "null"}]
    del prop["anyOf"]
    if len(rest) == 1:
        prop.update(rest[0])
    else:
        prop["anyOf"] = rest
    if prop.get("default", ...) is None:
        del prop["default"]


def protocol_schema() -> dict[str, Any]:
    """Both message unions and every shape they use, as one JSON Schema document."""
    ref = "#/$defs/{model}"
    client = TypeAdapter(ClientMessage).json_schema(
        mode="validation", schema_generator=_WireSchema, ref_template=ref
    )
    server = TypeAdapter(ServerMessage).json_schema(
        mode="serialization", schema_generator=_WireSchema, ref_template=ref
    )
    defs = client.pop("$defs") | server.pop("$defs")
    defs["ClientMessage"] = client
    defs["ServerMessage"] = server
    return {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "title": "Protocol",
        "description": "Every websocket frame: server/app/ws/protocol.py.",
        "anyOf": [
            {"$ref": ref.format(model="ClientMessage")},
            {"$ref": ref.format(model="ServerMessage")},
        ],
        "$defs": dict(sorted(defs.items())),
    }


def render() -> str:
    """The schema as the committed file holds it."""
    return json.dumps(protocol_schema(), indent=2, ensure_ascii=False) + "\n"
