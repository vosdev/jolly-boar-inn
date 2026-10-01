import { describe, expect, it } from 'vitest'

import { BALLOON_COLOURS, scatter, shade, TILE } from './partyFloor'

describe('scatter', () => {
  const floor = scatter(1440, 3200, 12345)
  const tiles = (1440 / TILE) * (3200 / TILE)

  it('drops about one thing to every two or three flagstones', () => {
    expect(floor.length / tiles).toBeGreaterThan(0.33)
    expect(floor.length / tiles).toBeLessThan(0.5)
  })

  it('makes about one drop in six a partyhat, and the rest balloons in the game colours', () => {
    const hats = floor.filter((drop) => drop.kind === 'hat').length
    expect(hats / floor.length).toBeGreaterThan(0.12)
    expect(hats / floor.length).toBeLessThan(0.22)
    const colours = new Set(floor.flatMap((drop) => (drop.kind === 'balloon' ? [drop.colour] : [])))
    expect([...colours].sort()).toEqual([...BALLOON_COLOURS].sort())
  })

  it('keeps everything on the floor', () => {
    for (const drop of scatter(333, 517, 9)) {
      expect(drop.x).toBeGreaterThan(0)
      expect(drop.y).toBeGreaterThan(0)
      expect(drop.x).toBeLessThan(Math.ceil(333 / TILE) * TILE)
      expect(drop.y).toBeLessThan(Math.ceil(517 / TILE) * TILE)
    }
  })

  it('scatters differently each visit', () => {
    expect(scatter(640, 640, 1)).not.toEqual(scatter(640, 640, 2))
  })

  it('leaves what already lies there when the page grows', () => {
    const short = scatter(640, 640, 77)
    const tall = scatter(640, 1280, 77)
    expect(tall.slice(0, short.length)).toEqual(short)
    expect(tall.length).toBeGreaterThan(short.length)
  })

  it('lays nothing on a floor with no size', () => {
    expect(scatter(0, 0, 5)).toEqual([])
  })
})

describe('shade', () => {
  it('moves a colour toward another by a share', () => {
    expect(shade('#e8513f', '#ffffff', 0)).toBe('#e8513f')
    expect(shade('#e8513f', '#000000', 1)).toBe('#000000')
    expect(shade('#000000', '#ffffff', 0.5)).toBe('#808080')
  })
})
