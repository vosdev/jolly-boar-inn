# Game sprites

The Wilderness poster's skull, what lies on the Jungle and Pollnivneach
floors, and Minimap Guesser's compass. Each SVG is the in-game sprite from the
[OSRS Wiki](https://oldschool.runescape.wiki/), pixel for pixel: one `<path>` per colour, made
of one-pixel-high runs, so it renders exactly as the PNG did at 1×. The sprites are © Jagex Ltd
and used under Jagex's fan content policy, like the rest of the game art; the README's license
section covers it.

| File | Wiki image |
|---|---|
| `fairy-ring.svg` | `Fairy_ring.png`, a render: cropped below its butterflies, 250px wide, 48 colours |
| `skull.svg` | `Skull.png` |
| `compass.svg` | `Compass.png`, the minimap's |
| `minimap-ring.svg` | `Minimap.png`'s ring round the map ² |
| `banana.svg`, `red-banana.svg`, `monkey-nuts.svg`, `pineapple.svg` | `Banana.png`, `Red_banana.png`, `Monkey_nuts.png`, `Pineapple.png` |
| `coconut.svg`, `half-coconut.svg`, `waterskin.svg`, `animal-skull.svg` | `Coconut.png`, `Half_coconut.png`, `Waterskin(4).png`, `Animal_skull.png` |
| `cactus.svg`, `kharidian-cactus.svg`, `rocks.svg` | `Cactus_(grown).png`, `Kharidian_cactus_(Healthy).png`, `Sandstone_rocks.png` ¹ |
| `camel.svg`, `kalphite-worker.svg`, `jungle-spider.svg` | `Camel.png`, `Kalphite_Worker.png`, `Jungle_spider.png` ¹ |

¹ A render, not an icon: shrunk to icon size (about 40 px), alpha cut at half, and outlined in
the icons' `#000001`. The jungle spider keeps no outline, as faint as it is in game.

² The orbs and the globe cover part of the ring there, so the ring keeps the game's pixels on the
right from the top down to 25° below east, takes the rest of the right from the top's mirror,
and mirrors the right half onto the left.
