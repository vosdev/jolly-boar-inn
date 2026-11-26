import { describe, expect, it } from 'vitest'

import { type IconIndex, iconsOnTile } from './mapIcons'

/** Falador's west bank, and a second icon two tiles from a tile's edge. */
const INDEX: IconIndex = {
  sprites: [
    [0, 0, 15, 15],
    [15, 0, 15, 15],
  ],
  icons: [
    [2946, 3368, 0],
    [2943, 3368, 1],
  ],
}

/** The Leaflet tile holding a game tile's middle, at a zoom: its rows count south. */
function tileOf(x: number, y: number, zoom: number): [number, number] {
  const scale = 2 ** zoom
  return [Math.floor(((x + 0.5) * scale) / 256), Math.floor((-(y + 0.5) * scale) / 256)]
}

describe('iconsOnTile', () => {
  it('centres an icon on its game tile, on a whole pixel', () => {
    expect(iconsOnTile(INDEX, 2, 46, -53)).toContainEqual({ sprite: 0, left: 3, top: 87 })
  })

  it('draws an icon on both tiles it straddles', () => {
    const west = iconsOnTile(INDEX, 2, 45, -53).map((placed) => placed.sprite)
    const east = iconsOnTile(INDEX, 2, 46, -53).map((placed) => placed.sprite)
    expect(west).toContain(1)
    expect(east).toContain(1)
    expect(west).not.toContain(0)
  })

  it('shows icons from zoom 0 up to the highest', () => {
    for (const zoom of [0, 1, 2, 3, 4, 5]) {
      const [x, row] = tileOf(2946, 3368, zoom)
      expect(iconsOnTile(INDEX, zoom, x, row).map((placed) => placed.sprite)).toContain(0)
    }
  })

  it('shows none below zoom 0', () => {
    for (const zoom of [-1, -2, -3]) {
      const [x, row] = tileOf(2946, 3368, zoom)
      expect(iconsOnTile(INDEX, zoom, x, row)).toEqual([])
    }
  })
})
