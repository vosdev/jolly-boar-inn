# Clan symbols

Prifddinas hangs one of the eight elven clans' symbols either side of the page, the same clan
on both, chosen at random each page load (`lib/clans.ts`). The symbol is the clan's
from the wiki. `make fetch-assets` fetches them from `data/assets.json`; without one, the wall
shows a flat mark in the clan's colour.

| File | Clan | Wiki file |
|---|---|---|
| `amlodd.png` | Amlodd | Amlodd Clan |
| `cadarn.png` | Cadarn | Cadarn Clan |
| `crwys.png` | Crwys | Crwys Clan |
| `hefin.png` | Hefin | Hefin Clan |
| `iorwerth.png` | Iorwerth | Iorwerth Clan |
| `ithell.png` | Ithell | Ithell Clan |
| `meilyr.png` | Meilyr | Meilyr Clan |
| `trahaearn.png` | Trahaearn | Trahaearn Clan |

Any file named `<clan>.<ext>` works, `<ext>` being `avif`, `webp`, `png`, `jpg`, `jpeg` or
`svg`. The symbols are game assets, so PNGs here are not committed (`.gitignore`).
