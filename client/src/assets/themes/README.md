# Theme emblems

Each theme's emblem is an item icon from the wiki that belongs to its place, shown in the top
bar's menu control and beside each theme in the menu (section 5 of `ideas/design.md`).
`make fetch-assets` fetches them from `data/assets.json`; without one, the theme draws its
placeholder: a flat mark in its own accent colour.

| File | Theme | Icon | Placeholder |
|---|---|---|---|
| `jolly.png` | Jolly Boar Inn | Beer | A tankard |
| `pollnivneach.png` | Pollnivneach | Desert shirt | A domed house and a palm |
| `wilderness.png` | Wilderness | Skull | A skull |
| `party_room.png` | Party Room | Red partyhat | A partyhat |
| `tzhaar.png` | Toktz | Toktz-ket-xil | A volcano |
| `jungle.png` | Jungle | Banana | A banana |
| `prifddinas.png` | Prifddinas | Prifddinas icon detail | Three crystal shards |
| `morytania.png` | Morytania | Ectophial | A stoppered flask |
| `zanaris.png` | Zanaris | Dramen staff | A spotted mushroom |

Any file named `<theme>.<ext>` works, `<ext>` being `avif`, `webp`, `png`, `jpg`, `jpeg` or
`svg`. The bar's slot is 32px; a sprite is drawn at its own size, pixelated, never blurred up, and a
detail image (wider than 64px) is shrunk to fit, smoothly. An
icon cannot follow the theme's tokens, so it keeps its own colours.

The icons are game assets, so PNGs here are not committed (`.gitignore`), like the NPC art.
