# Splash scenes

The artwork behind a round's splash (D7, section 7.1 of `ideas/design.md`). None of it
exists yet; until it does, the splash draws a placeholder panel carrying the mode's name.

Drop a file in and it is used on the next build. No code changes.

| File | What | Size |
|---|---|---|
| `<scene id>.<ext>` | One of the six pub scenes, full-bleed at the top of the card | 16:9, 1280×720 or larger |
| `marks/<mode id>.<ext>` | A mode's small foreground mark — a coin stack, a scroll | Square, transparent, 256×256 |

`<ext>` is any of `avif`, `webp`, `png`, `jpg`, `jpeg` or `svg`.

The scene ids, and which mode hangs behind which scene, are in `client/src/lib/modes.ts`:
`jolly_boar`, `blue_moon`, `rusty_anchor`, `dead_mans_chest`, `rising_sun`, `dragon_inn`.
The bottom edge of a scene fades into the card, so keep anything that matters out of its
lowest fifth.

The art is original work (section 9.1), never a game asset with the text swapped.
