/** Which sheet each theme hangs on the stage, and which of them has rolls. */

import { describe, expect, it } from 'vitest'

import { hasRolls, sheetFor } from './sheet'

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
