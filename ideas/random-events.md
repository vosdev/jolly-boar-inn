# Random events

The roster of NPCs who interrupt a round, and the questions each of them asks. T22 turns
this file into `server/app/random_events.py` (the ids), `client/src/lib/randomEvents.ts`
(the copy) and `data/packs/random_events/<id>.json` (the questions). T22 does not start
until this file has twelve NPCs.

Everything below the line **TODO: owner** is a suggestion to replace, cut or extend. The
twelve ids are the ones `server/app/random_events.py` holds today. Renaming or swapping
one is fine before T22 lands.

## How many

**Twelve NPCs.** A room has one event slot per round after the first, and no NPC shows up
twice in a room unless the host picks it twice. So the roster must be at least as long as
the most slots a room can hold. That is 9 once Phase 2's ten modes exist and 11 with Phase
3's two image modes. `tests/test_random_events.py` enforces it. Twelve leaves one spare.

**Questions: two or three per NPC to ship T22, about five per NPC as the target.** A room
draws at most one question per NPC, so a group that plays weekly meets each NPC about once
a game. Five means a month without a repeat.

## One NPC

| Field | What it is |
|---|---|
| `id` | `a-z0-9_`, at most 32 characters. Stored in `questions.random_event`, and the name of its question file. Never renamed after it ships. |
| name | As shown on the card: "Sandwich Lady". |
| theme | What it asks about, in a few words. This is the rule for writing its questions. |
| opening line | What it says before the question, in the game's voice. One short sentence. |
| asset | `npc:<id>` for the card's picture. The picture itself is Phase 3; until then the card is text. |

## One question

Every question is one entry in the NPC's file. The file names the NPC, so a question never
repeats it. The fields per type are the schema's (`ideas/architecture.md` §2):

| Type | You write | The other answers |
|---|---|---|
| `multiple_choice` | `prompt`, `options` (2–7), `answer_index` | the wrong `options` |
| `closest_number` | `prompt`, `answer`, optional `unit` | none; nearest wins |
| `free_text` | `prompt`, `accepted` (1–20) | `accepted` holds the alternative spellings, not wrong answers |
| `more_less` | `metric`, `direction`, two subjects with values, `answer_index` | the other subject |
| `price_is_right` | `subject`, `value`, four `options`, `answer_index` | the three wrong prices |
| `ordering` | `prompt`, `entries` with `rank`, `answer`, `ends` | none; it is an order. Only after T27 |
| `pick_from_list` | `prompt`, `vocab: items`, `answer_id` | the whole item list; the answer must be on `data/popular-items.json` |

Every type may also carry an `explanation`, which is shown in the reveal. Use it: a random
event is the place for the one fact nobody knew.

Three caveats:

- `more_less` and `price_is_right` can only compare **prices** (`ge_price`, `high_alch`,
  `shop_price`). "Which heals more?" does not fit, so write it as `multiple_choice`.
  `ge_price` goes stale in a hand-written file, so use `high_alch` or `shop_price`, which
  do not drift.
- `pick_from_list` with a picture (a Certer holding up an item's shadowy outline) needs
  Phase 3's images. In words, it works now.
- Keep to the NPC's theme. The joke is that they only care about their own subject.

Example, `data/packs/random_events/sandwich_lady.json`:

```json
{
  "pack": "random_events",
  "random_event": "sandwich_lady",
  "questions": [
    {
      "id": "q_…", "type": "closest_number", "mode": "random_event", "source": "pack",
      "tags": ["cooking"],
      "payload": {
        "prompt": "What Cooking level do you need to cook a shark?",
        "answer": 80,
        "explanation": "It keeps burning until 99, or 94 with cooking gauntlets."
      }
    }
  ]
}
```

(Check facts like that burn level on the wiki before shipping. `make validate-packs` checks
the shape, not the truth.)

## TODO: owner

The twelve NPCs in the code today, with a suggested theme for each. Fill in the name, line
and questions, or swap any of them for something from the candidates below.

| id | Theme (suggested) | Good types |
|---|---|---|
| `sandwich_lady` | cooking and food | closest_number (levels, heals), multiple_choice |
| `rick_turpentine` | money: alch values, shop prices | more_less, price_is_right |
| `dr_jekyll` | herblore, potions, secondaries | multiple_choice, free_text |
| `evil_bob` | fishing, and cats | multiple_choice, closest_number |
| `freaky_forester` | woodcutting and hunter | multiple_choice, closest_number |
| `drunken_dwarf` | ales, kebabs, dwarves, Keldagrim | multiple_choice, free_text |
| `genie` | skills and XP | closest_number |
| `sergeant_damien` | combat: gear, styles, bosses | multiple_choice |
| `quiz_master` | anything at all: he runs a quiz | any |
| `mr_mordaut` | the surprise exam: patterns, odd one out | multiple_choice |
| `mysterious_old_man` | quests and lore | multiple_choice, free_text |
| `count_check` | account security, and counting | closest_number |

For each one, copy this block:

```
### <id>
- Name:
- Theme:
- Opening line:
- Asset: npc:<id>
- Questions:
  1. <type> — <prompt> — answer: … — other answers: … — explanation: …
  2.
  3.
```

### Other candidates

Random events, current or retired, and a few NPCs who would make a fine one:

- **Certer** (Giles, Miles, Niles): "which of these is a helmet?" as `multiple_choice` now,
  and "what is this item?" from its outline as `pick_from_list` in Phase 3.
- **Frog prince / princess**: romance and swamps, Lumbridge Swamp.
- **Beekeeper**: farming, and building things in the right order (`ordering`, after T27).
- **Postie Pete**: places and cities: "where would you deliver this?".
- **Capt' Arnav**: treasure and chests, the combination is the answer.
- **Leo the gravedigger**: death, gravestones, Prayer.
- **Pillory guard**: crime, thieving.
- **Flippa**: flipping on the GE, prices (a rival to Rick Turpentine's theme).
- **Strange plant**: farming, seeds.
- **Pinball**: speed round; any subject.
