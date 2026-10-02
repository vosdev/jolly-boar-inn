# Podium trophies

The trophies on the standings podium (section 7.3 of `ideas/design.md`): the five
Quest Speedrunning trophies, one per rank from first to fifth. None are here yet; until
they are, the podium draws `placeholder/<tier>.svg`, a plain cup tinted for the tier.

Drop a file in and it is used on the next build. No code changes.

| File | Rank | Size |
|---|---|---|
| `diamond.<ext>` | 1st | Transparent, 128px tall or larger; drawn contained in a square |
| `platinum.<ext>` | 2nd | |
| `gold.<ext>` | 3rd | |
| `silver.<ext>` | 4th | |
| `bronze.<ext>` | 5th | |

`<ext>` is any of `avif`, `webp`, `png`, `jpg`, `jpeg` or `svg`. The podium draws them at
40px on a phone and 56px wider than that, so a render should read at that size.

These are game renders, fetched rather than committed: `make fetch-assets` puts the ones
`data/assets.json` names here. The placeholders are committed, and stay as the fallback for
any tier without a render.
