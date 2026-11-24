/** The clans whose symbols Prifddinas hangs, one picked at random, each with its symbol or mark. */

import { describe, expect, it } from 'vitest'

import { CLANS, pickClan, symbolFile } from './clans'

describe('CLANS', () => {
  it('is the eight elven clans of Prifddinas', () => {
    expect(CLANS.map((clan) => clan.name)).toEqual([
      'Amlodd',
      'Cadarn',
      'Crwys',
      'Hefin',
      'Iorwerth',
      'Ithell',
      'Meilyr',
      'Trahaearn',
    ])
  })

  it('gives every clan a placeholder mark of its own', () => {
    expect(new Set(CLANS.map((clan) => JSON.stringify(clan.mark))).size).toBe(CLANS.length)
  })
})

describe('pickClan', () => {
  it('can pick every clan, and nothing else', () => {
    const picked = Array.from({ length: CLANS.length }, (_, n) => pickClan(n / CLANS.length))
    expect(picked).toEqual(CLANS)
    expect(pickClan(0.999999)).toBe(CLANS.at(-1))
  })
})

describe('symbolFile', () => {
  it("finds a clan's fetched symbol by its id, and null without one", () => {
    const files = { '../assets/clans/ithell.png': '/assets/ithell-abc.png' }
    expect(symbolFile('ithell', files)).toBe('/assets/ithell-abc.png')
    expect(symbolFile('cadarn', files)).toBeNull()
  })
})
