# Random events

How to write an NPC's questions. Where events land and who asks them is
`ideas/architecture.md` §5 ("Random events"); the ids live in
`server/app/random_events.py`, the copy in `client/src/lib/randomEvents.ts`, and the
questions in `data/packs/random_events/<id>.json`, one file per NPC.

## One NPC

| Field | What it is |
|---|---|
| `id` | `a-z0-9_`, at most 32 characters. Stored in `questions.random_event`, and the name of its question file. Never renamed after it ships. |
| name | As shown on the card: "Sandwich Lady". |
| theme | What it asks about, in a few words. This is the rule for writing its questions. |
| right, wrong | What it says in the reveal to an answer that scored, and to one that did not or none. At most 60 characters each. |
| asset | `npc:<id>` for the card's picture. The picture itself waits for the Images milestone; until then the card is text. |

## One question

Every question is one entry in the NPC's file. The file names the NPC once, as
`"random_event"`, so a question never repeats it. The payload fields are the schema's
(`schema/question.schema.json`):

| Type | You write | The other answers |
|---|---|---|
| `multiple_choice` | `intro`, `prompt`, `options` (2–6), `answer_index` | the wrong `options` |
| `closest_number` | `intro`, `prompt`, `answer`, optional `unit` | none; nearest wins |
| `free_text` | `intro`, `prompt`, `accepted` (1–20) | `accepted` holds the alternative spellings, not wrong answers |
| `pick_from_list` | `intro`, `prompt`, `vocab` (`items` or `examines`), `answer_id` | the whole list; the answer must be an entry of it |
| `ordering` | `prompt`, `entries` with `rank`, `answer`, `ends` | none; it is an order. Only after #82 |

`intro` is the NPC talking, at most 150 characters, typed in while the question waits: the
character goes here. `prompt` is the plain question, shown whole in bold from the start, and
it makes sense without the intro: "What is Hespori's combat level?".

Every type may also carry an `explanation`, which is shown in the reveal. Use it: a random
event is the place for the one fact nobody knew.

- `more_less` and `price_is_right` are refused as events: only their own round shows the
  item they ask about. "Which heals more?" is `multiple_choice`.
- `pick_from_list` with a picture (a Certer holding up an item's shadowy outline) needs
  the Images milestone. In words, it works now.
- Keep to the NPC's theme. The joke is that they only care about their own subject.
- Check every fact on the wiki. `make validate-packs` checks the shape, not the truth.

The six finished files (`bob`, `death`, `dr_jekyll`, `jane`, `krystilia`,
`lumbridge_cook`) are the examples to copy.

## Owed

These NPCs are on the roster with no questions yet, so they only ever ask a host's question.
`AWAITING_QUESTIONS` in `server/tests/test_random_events.py` is the tracker: writing an
NPC's file means taking it off that list. At least two questions each, around five as the
target.

| id | Theme |
|---|---|
| `sandwich_lady` | Cooking and food |
| `survival_expert` | Woodcutting, Hunter and Firemaking |
| `drunken_dwarf` | Ales, kebabs, dwarves and pubs |
| `thurgo` | Mining and Smithing |
| `genie` | Skills and experience |
| `sergeant_damien` | Combat: gear, styles and bosses |
| `wise_old_man` | Quests and lore |
| `ned` | Sailing |
| `baba_yaga` | Magic and Runecrafting |

## Other candidates

NPCs who would make a fine event, not on the roster:

- **Certer** (Giles, Miles, Niles): "which of these is a helmet?" as `multiple_choice` now,
  and "what is this item?" from its outline as `pick_from_list` in the Images milestone.
- **Frog prince / princess**: romance and swamps, Lumbridge Swamp.
- **Beekeeper**: farming, and building things in the right order (`ordering`, after #82).
- **Postie Pete**: places and cities: "where would you deliver this?".
- **Capt' Arnav**: treasure and chests, the combination is the answer.
- **Leo the gravedigger**: death, gravestones, Prayer.
- **Pillory guard**: crime, thieving.
- **Flippa**: flipping on the GE, prices.
- **Strange plant**: farming, seeds.
- **Pinball**: speed round; any subject.
