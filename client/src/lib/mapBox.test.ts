import { describe, expect, it } from 'vitest'

import { SURFACE } from './map'
import {
  boxAt,
  cornerOf,
  DEFAULT_REACH,
  LEAST_BOX,
  middleOf,
  moveBox,
  pullCorner,
  reachLine,
  reachPoints,
} from './mapBox'

const BOX = { minX: 3000, maxX: 3040, minY: 3200, maxY: 3220 }

describe('a box on the map', () => {
  it('stands round the tile it was put on', () => {
    expect(boxAt({ x: 3000, y: 3200 }, 30, 30)).toEqual({
      minX: 2985,
      maxX: 3015,
      minY: 3185,
      maxY: 3215,
    })
  })

  it('slides back onto the surface whole', () => {
    const low = boxAt({ x: SURFACE.minX, y: SURFACE.minY }, 30, 30)
    expect([low.minX, low.minY]).toEqual([SURFACE.minX, SURFACE.minY])
    const high = boxAt({ x: SURFACE.maxX, y: SURFACE.maxY }, 30, 30)
    expect([high.maxX, high.maxY]).toEqual([SURFACE.maxX - 1, SURFACE.maxY - 1])
  })

  it('keeps its size when moved', () => {
    const moved = moveBox(BOX, { x: 2000, y: 3000 })
    expect([moved.maxX - moved.minX, moved.maxY - moved.minY]).toEqual([40, 20])
    expect(middleOf(moved)).toEqual({ x: 2000, y: 3000 })
  })

  it('moves only the corner pulled', () => {
    expect(pullCorner(BOX, 'ne', { x: 3100, y: 3300 })).toEqual({
      ...BOX,
      maxX: 3100,
      maxY: 3300,
    })
    expect(pullCorner(BOX, 'sw', { x: 2950, y: 3100 })).toEqual({
      ...BOX,
      minX: 2950,
      minY: 3100,
    })
    expect(cornerOf(BOX, 'nw')).toEqual({ x: BOX.minX, y: BOX.maxY })
  })

  it('never gets smaller than a target may be, or leaves the surface', () => {
    const pinched = pullCorner(BOX, 'se', { x: 0, y: 9999 })
    expect(pinched.maxX - pinched.minX).toBe(LEAST_BOX)
    expect(pinched.maxY - pinched.minY).toBe(LEAST_BOX)
    const stretched = pullCorner(BOX, 'ne', { x: 9999, y: 9999 })
    expect([stretched.maxX, stretched.maxY]).toEqual([SURFACE.maxX - 1, SURFACE.maxY - 1])
  })
})

describe('a reach', () => {
  it('draws a line exactly its tiles from the box', () => {
    for (const { x, y } of reachLine(BOX, 50)) {
      const across = Math.max(BOX.minX - x, x - BOX.maxX, 0)
      const up = Math.max(BOX.minY - y, y - BOX.maxY, 0)
      expect(Math.hypot(across, up)).toBeCloseTo(50)
    }
  })

  it('is worth what the server grades', () => {
    expect(reachPoints(DEFAULT_REACH)).toEqual([
      { tiles: 0, points: 1000 },
      { tiles: 25, points: 750 },
      { tiles: 50, points: 500 },
      { tiles: 75, points: 250 },
      { tiles: 100, points: 0 },
    ])
    expect(reachPoints(50)[1]).toEqual({ tiles: 13, points: 740 })
  })
})
