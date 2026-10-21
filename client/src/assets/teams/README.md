# Team logos

Each team is a god, and its logo is the god's symbol from the wiki, shown wherever a team is
named. `make fetch-assets` fetches them from `data/assets.json`; without one, the team draws
its placeholder: a flat shield in the god's colours (`lib/teams.ts`) with a mark on it.

| File | Team | Wiki file | Placeholder |
|---|---|---|---|
| `saradomin.png` | Saradomin | Saradomin symbol | A four-pointed star |
| `zamorak.png` | Zamorak | Zamorak symbol | A flame |
| `guthix.png` | Guthix | Guthix symbol | A leaf |
| `armadyl.png` | Armadyl | Armadyl symbol | A pair of wings |
| `bandos.png` | Bandos | Bandos symbol | Horns |
| `zaros.png` | Zaros | Zaros symbol | A ring |

Any file named `<god>.<ext>` works, `<ext>` being `avif`, `webp`, `png`, `jpg`, `jpeg` or `svg`.
The symbols are game assets, so PNGs here are not committed (`.gitignore`).
