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
| `minimap-ring.svg` | `Minimap.png`'s ring round the map ² Not pixel for pixel: smooth arcs, six bands thick as in game, each arc's colour the mean of
the ring's pixels in `Minimap.png` round that angle, so the light moves round it as it does there.
The orbs and the globe cover the ring's left and lower right, which are mirrored from the rest.
