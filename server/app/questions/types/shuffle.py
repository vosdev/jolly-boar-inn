"""The order a question shows its options or entries in: a shuffle seeded by its payload.

An author writes the right answer first more often than not, so the authored order would
give it away on screen and on the wire alike. Seeding from the payload's content, never a
clock or the room, gives every socket, every reconnect and every restart one order.
"""

import hashlib
import json
import random
from typing import Any


def seeded_order(type_id: str, payload: dict[str, Any], count: int) -> list[int]:
    """``range(count)`` shuffled by a hash of ``type_id`` and ``payload``."""
    material = f"{type_id}\n".encode() + json.dumps(
        payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False
    ).encode("utf-8")
    order = list(range(count))
    random.Random(hashlib.sha256(material).digest()).shuffle(order)
    return order
