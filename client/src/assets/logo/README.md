# Logo sources

The wiki files `make logo` (`server/scripts/build_logo.py`) draws the owner's logo from, into
`branding/boar/`. The client never loads anything here.

| File | Wiki file |
|---|---|
| `broav_detail.png` | `Broav detail.png`, traced into the boar's head |
| `skull.png` | `Skull.png`, the PK skull the wilderness boar wears |

They are game assets and not committed (`.gitignore`): `make fetch-assets ONLY=logo` fetches them.
