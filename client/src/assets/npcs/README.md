# NPC art

The hosts on the stage (section 8 of `ideas/design.md`) and the random-event NPCs (section 12).
Each NPC is named by its id and has up to two files from the OSRS Wiki:

| File | Wiki file | Shown |
|---|---|---|
| `<id>_chathead.png` | The chathead, e.g. `Ali_Morrisane_chathead.png` | As it is |
| `<id>.png` | The full-body render, e.g. `Ali_Morrisane.png` | Only without a chathead: its head, mirrored |

Drop the wiki file in unchanged: the stage crops and mirrors itself, so that a host on the left and
an event NPC on the right both face the scroll. An event NPC needs a chathead. `<ext>` may be any of `avif`, `webp`, `png`,
`jpg` or `jpeg`. An `.svg` is an original drawing and is shown as it is, uncropped.

An NPC with neither file is the committed `innkeeper.svg`. The wiki files are game assets and not
committed (`.gitignore`), so a fresh checkout has every host as the innkeeper until you run
`make fetch-assets`, which fetches the file `data/assets.json` names for each NPC.
