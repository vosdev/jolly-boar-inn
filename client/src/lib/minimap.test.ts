import { describe, expect, it } from 'vitest'

import pin from '../../../data/map.json'
import fixture from './minimap.fixture.json'
import {
  MINIMAP_SIDE,
  minimapTarget,
  minimapTiles,
  onSurface,
  TURNABLE,
  wrapAngle,
} from './minimap'

describe('the minimap preview', () => {
  it('places the same tiles as the baker, which `test_minimap_guesser.py` holds to this too', () => {
    expect([MINIMAP_SIDE, TURNABLE]).toEqual([fixture.side, fixture.turnable])
    for (const { spot, tiles } of fixture.cases) {
      expect(minimapTiles(spot)).toEqual(
        tiles.map(({ column, row, left, top }) => ({
          url: `/map/${pin.cache_id}/clean/2/0_${column}_${row}.png`,
          left,
          top,
        })),
      )
    }
  })

  it('wraps a turn into 0 to 359', () => {
    expect([wrapAngle(-15), wrapAngle(360), wrapAngle(375), wrapAngle(90)]).toEqual([
      345, 0, 15, 90,
    ])
  })

  it('takes a spot on the surface only', () => {
    expect(onSurface({ x: 3212, y: 3428 })).toBe(true)
    expect(onSurface({ x: 700, y: 3428 })).toBe(false)
    expect(onSurface({ x: 3212, y: 4352 })).toBe(false)
  })

  it('aims at the spot’s own box', () => {
    expect(minimapTarget({ x: 3212, y: 3428 }, 'Varrock Square')).toEqual({
      name: 'Varrock Square',
      min_x: 3207,
      max_x: 3217,
      min_y: 3423,
      max_y: 3433,
    })
  })
})
