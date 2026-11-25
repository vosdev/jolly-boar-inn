import { describe, expect, it } from 'vitest'

import { type LabelIndex, labelsOnTile } from './placeNames'

const F: [number, number, number, number, number, number] = [0, 0, 7, 9, 0, 26]

/** "FF" over "F" in the medium font, a small and a large label beside it. */
const INDEX: LabelIndex = {
  fonts: [0, 1, 2].map(() => ({ ascent: 35, advances: Array(256).fill(8), glyphs: { 70: F } })),
  labels: [
    [2965, 3380, 1, 0xffffff, ['FF', 'F']],
    [2965, 3380, 0, 0xffffff, ['F']],
    [2965, 3380, 2, 0xff981f, ['F']],
  ],
}

/** The Leaflet tile holding a game tile's corner, at a zoom: its rows count south. */
function tileOf(x: number, y: number, zoom: number): [number, number] {
  const scale = 2 ** zoom
  return [Math.floor((x * scale) / 256), Math.floor((-(y + 2) * scale - 17) / 256)]
}

const sizesAt = (zoom: number): number[] => {
  const [x, row] = tileOf(2965, 3380, zoom)
  const colours = labelsOnTile(INDEX, zoom, x, row).map((written) => written.colour)
  return [...new Set(colours)]
}

describe('labelsOnTile', () => {
  it('centres each line on its spot, a tile north, half the ascent apart', () => {
    const medium = labelsOnTile({ ...INDEX, labels: [INDEX.labels[0]!] }, 2, 46, -53)
    expect(medium.map(({ left, top }) => [left, top])).toEqual([
      [76, 49],
      [84, 49],
      [80, 66],
    ])
  })

  it('writes a glyph that straddles two tiles on both', () => {
    const index: LabelIndex = { ...INDEX, labels: [[2943, 3380, 1, 0xffffff, ['FF']]] }
    expect(labelsOnTile(index, 2, 45, -53).map(({ left }) => left)).toEqual([244, 252])
    expect(labelsOnTile(index, 2, 46, -53).map(({ left }) => left)).toEqual([-4])
  })

  it('shows large names from zoom -2, medium from -1 and small from 0', () => {
    expect(sizesAt(-3)).toEqual([])
    expect(sizesAt(-2)).toEqual([0xff981f])
    expect(sizesAt(-1).length).toBe(2)
    expect(labelsOnTile(INDEX, -1, ...tileOf(2965, 3380, -1))).toHaveLength(3 + 1)
    expect(labelsOnTile(INDEX, 0, ...tileOf(2965, 3380, 0))).toHaveLength(3 + 1 + 1)
  })
})
