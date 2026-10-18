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
    expect(sheetFor('prifddinas')).toBe('gauntlet')
    expect(sheetFor('morytania')).toBe('gravestone')
  })

  it('puts up the notice board on Home in the inn only', () => {
    expect(sheetFor('jolly', true)).toBe('board')
    expect(sheetFor('pollnivneach', true)).toBe('scroll')
    expect(sheetFor('wilderness', true)).toBe('poster')
    expect(sheetFor('party_room', true)).toBe('bunting')
    expect(sheetFor('tzhaar', true)).toBe('slab')
    expect(sheetFor('jungle', true)).toBe('bamboo')
    expect(sheetFor('prifddinas', true)).toBe('gauntlet')
    expect(sheetFor('morytania', true)).toBe('gravestone')
  })

  it("falls back to the inn's for a theme it does not know", () => {
    expect(sheetFor('')).toBe('scroll')
    expect(sheetFor('from_a_newer_build', true)).toBe('board')
  })
})

describe('hasRolls', () => {
  it('is the scroll alone', () => {
    const sheets = ['scroll', 'board', 'poster', 'bunting', 'slab', 'bamboo', 'gauntlet', 'gravestone']
    expect(sheets.filter((sheet) => hasRolls(sheet as never))).toEqual(['scroll'])
  })
})
