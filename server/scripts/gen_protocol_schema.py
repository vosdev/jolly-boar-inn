"""Rewrite ``schema/protocol.schema.json`` from the websocket models (``app/ws/schema.py``).

Run through ``make gen-protocol``, which also regenerates the client's types from it.

Usage (from ``server/``)::

    uv run python scripts/gen_protocol_schema.py
"""

from app.ws.schema import SCHEMA_PATH, render

if __name__ == "__main__":
    SCHEMA_PATH.write_text(render(), encoding="utf-8")
    print(f"wrote {SCHEMA_PATH}")
