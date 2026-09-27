# NPC art

The hosts on the stage (D14, section 8 of `ideas/design.md`), and later the random-event NPCs
(D15). Each NPC is two files from the OSRS Wiki, named by the NPC's id:

| File | Wiki file | Shown |
|---|---|---|
| `<id>.png` | The full-body render, e.g. `Ali_Morrisane.png` | Its top half, mirrored, beside the scroll |
| `<id>_chathead.png` | The chathead, e.g. `Ali_Morrisane_chathead.png` | As it is, on a phone |

Drop the wiki file in unchanged: the stage crops and mirrors a render itself, because the wiki's
renders face left and the host has to face the scroll. `<ext>` may be any of `avif`, `webp`, `png`,
`jpg` or `jpeg`. An `.svg` is an original drawing and is shown as it is, uncropped.

An NPC with only one of its files shows that one at both sizes. An NPC with neither is the
committed `innkeeper.svg`. The PNGs are not committed yet (`.gitignore`), so a fresh checkout has
every host as the innkeeper.
