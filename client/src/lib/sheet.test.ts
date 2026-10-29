/** Which sheet each theme hangs on the stage, which of them has rolls, and how the bunting hangs. */

import { describe, expect, it } from 'vitest'

import { BUNTING_HEIGHT, buntingLayout, buntingSwags, hasRolls, sheetFor } from './sheet'

describe('sheetFor', () => {
  it('gives each theme its own sheet', () => {
    expect(sheetFor('jolly')).toBe('scroll')
    expect(sheetFor('pollnivneach')).toBe('scroll')
    expect(sheetFor('wilderness')).toBe('poster')
    expect(sheetFor('party_room')).toBe('bunting')
    expect(sheetFor('tzhaar')).toBe('slab')
    expect(sheetFor('jungle')).toBe('bamboo')
    expect(sheetFor('gauntlet')).toBe('gauntlet')
    expect(sheetFor('corrupted_gauntlet')).toBe('gauntlet')
    expect(sheetFor('morytania')).toBe('gravestone')
    expect(sheetFor('zanaris')).toBe('sign')
  })

  it("falls back to the inn's for a theme it does not know", () => {
    expect(sheetFor('')).toBe('scroll')
    expect(sheetFor('from_a_newer_build')).toBe('scroll')
  })
})

describe('hasRolls', () => {
  it('is the scroll alone', () => {
    const sheets = [
      'scroll',
      'poster',
      'bunting',
      'slab',
      'bamboo',
      'gauntlet',
      'gravestone',
      'sign',
    ]
    expect(sheets.filter((sheet) => hasRolls(sheet as never))).toEqual(['scroll'])
  })
})

describe('buntingSwags', () => {
  it('hangs one swag for about every 180 pixels, so the flags keep their size on a wide sheet', () => {
    expect(buntingSwags(540)).toBe(3)
    expect(buntingSwags(900)).toBe(5)
    expect(buntingSwags(1000)).toBe(6)
  })

  it('hangs two at the least, on a phone or before the sheet is measured', () => {
    expect(buntingSwags(0)).toBe(2)
    expect(buntingSwags(320)).toBe(2)
  })
})

describe('buntingLayout', () => {
  it('knots every swag at both ends and hangs four flags on each', () => {
    const bunting = buntingLayout(900)
    expect(bunting.swags).toHaveLength(5)
    expect(bunting.knots).toHaveLength(6)
    expect(bunting.flags).toHaveLength(20)
    expect(bunting.knots[0]).toBeGreaterThan(0)
    expect(bunting.knots.at(-1)).toBeLessThan(bunting.width)
  })

  it('keeps the flags 18 units tall and inside the bunting on any sheet', () => {
    for (const width of [0, 320, 900, 1600]) {
      for (const { d } of buntingLayout(width).flags) {
        const [y = NaN, side, drop = NaN] = d
          .match(/^M\S+ (\S+)h(\S+)l\S+ (\S+)z$/)!
          .slice(1)
          .map(Number)
        expect(side).toBe(18)
        expect(drop).toBe(18)
        expect(y + drop).toBeLessThanOrEqual(BUNTING_HEIGHT)
      }
    }
  })

  it('draws two swags before the sheet is measured', () => {
    expect(buntingLayout(0).swags).toHaveLength(2)
  })
})
