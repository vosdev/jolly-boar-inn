# Theme emblems

Each theme's emblem is the Leagues flag of the area its place is in, shown in the top bar's menu
control and beside each theme in the menu (section 5 of `ideas/design.md`). Until a flag is here,
the theme draws its placeholder: a flat mark in its own accent colour.

Drop a file in and it is used on the next build. No code changes.

| File | Theme | Leagues area | Placeholder |
|---|---|---|---|
| `jolly.<ext>` | Jolly Boar Inn (Varrock) | Misthalin | A tankard |
| `pollnivneach.<ext>` | Pollnivneach | Desert | A domed house and a palm |
| `wilderness.<ext>` | Wilderness | Wilderness | A skull |
| `party_room.<ext>` | Party Room | Asgarnia | A partyhat |
| `tzhaar.<ext>` | TzHaar, not built yet | Karamja | A volcano |

`<ext>` is any of `avif`, `webp`, `png`, `jpg`, `jpeg` or `svg`. Square and transparent;
it is drawn at 24px in the bar and 32px in the menu. A flag cannot follow the theme's tokens,
so it keeps its own colours.

The flags are game assets, so PNGs here are not committed (`.gitignore`), like the NPC art.
