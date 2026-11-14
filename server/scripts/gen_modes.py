"""Rewrite ``schema/modes.json`` from the mode registry (``app/modes/rules.py``).

Run through ``make gen-modes`` after changing ``MODES``, ``UPCOMING`` or ``PLANNED``.

Usage (from ``server/``)::

    uv run python scripts/gen_modes.py
"""

from app.modes.rules import MODES_PATH, render

if __name__ == "__main__":
    MODES_PATH.write_text(render(), encoding="utf-8")
    print(f"wrote {MODES_PATH}")
