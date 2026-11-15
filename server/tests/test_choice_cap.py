"""No question offers more than six choices, one per gem (design §3), whatever its type.

How a choice array is recognised: it is not. Every array anywhere in the schema counts as
one unless ``NOT_CHOICES`` names it with a reason, so a new type's array is held to the cap
whatever its field is called, and leaving it out takes a reviewed line here. A choice array
must reference ``$defs/choices``, the one shared cap, and may only narrow it.
"""

import math
from collections.abc import Iterator
from typing import Any

from app.questions import schema

GEMS = 6
CAP = "#/$defs/choices"
ARRAY_KEYWORDS = ("items", "prefixItems", "contains", "minItems", "maxItems", "uniqueItems")

NOT_CHOICES = {
    "/properties/tags": "labels on the envelope, never shown as buttons",
    "/$defs/accepted": "free_text's accepted spellings, typed rather than picked",
    "/$defs/choices": "the cap itself",
    "/$defs/pick_all_that_apply/properties/answer_indices": "the right options, never buttons",
    "/$defs/ordering/properties/ends": "the labels at either end, never buttons",
    "/$defs/ordering/properties/answer": "the right order of the entries, never buttons",
    "/$defs/matching/properties/fields": "the places options are dropped on, never buttons",
    "/$defs/matching/properties/answer": "the option on each field, never buttons",
    "/$defs/map_pin/properties/targets": "places on the map, a pin each, never buttons",
    "/$defs/picture_pin/properties/cells": "the right cells of a grid, tapped, never buttons",
}


def arrays(node: Any, pointer: str = "") -> Iterator[tuple[str, dict[str, Any]]]:
    """Every subschema that describes an array, with its JSON pointer."""
    if isinstance(node, dict):
        if node.get("type") == "array" or any(key in node for key in ARRAY_KEYWORDS):
            yield pointer, node
        for key, child in node.items():
            yield from arrays(child, f"{pointer}/{key}")
    elif isinstance(node, list):
        for index, child in enumerate(node):
            yield from arrays(child, f"{pointer}/{index}")


def cap_problems(document: dict[str, Any]) -> list[str]:
    cap = document["$defs"]["choices"]
    problems = [] if cap.get("maxItems") == GEMS else [f"$defs/choices: maxItems is not {GEMS}"]
    for pointer, node in arrays(document):
        if pointer in NOT_CHOICES:
            continue
        if node.get("$ref") != CAP:
            problems.append(f"{pointer}: a choice array that does not reference {CAP}")
        elif node.get("maxItems", -math.inf) > GEMS:
            problems.append(f"{pointer}: maxItems {node['maxItems']} is over {GEMS}")
    return problems


def test_every_choice_array_references_the_six_gem_cap() -> None:
    assert cap_problems(schema.load_schema()) == []


def test_the_walk_finds_the_choice_arrays_there_are() -> None:
    found = {pointer for pointer, _ in arrays(schema.load_schema())} - set(NOT_CHOICES)
    assert found == {
        *(
            f"/$defs/{kind}/properties/options"
            for kind in ("more_less", "multiple_choice", "pick_all_that_apply")
        ),
        "/$defs/ordering/properties/entries",
        "/$defs/matching/properties/options",
    }


def test_a_new_array_under_any_name_is_held_to_the_cap() -> None:
    document = schema.load_schema()
    renamed = {
        **document,
        "$defs": {
            **document["$defs"],
            "sort_of": {"properties": {"entries": {"type": "array", "maxItems": 7}}},
            "narrowed": {"properties": {"picks": {"$ref": CAP, "maxItems": 7}}},
        },
    }
    assert cap_problems(renamed) == [
        "/$defs/sort_of/properties/entries: a choice array that does not reference " + CAP,
        "/$defs/narrowed/properties/picks: maxItems 7 is over 6",
    ]
