import { describe, expect, it } from 'vitest'

import { fitting, perRow } from './evenRows'

describe('perRow', () => {
  it('leaves no straggler on a row of its own', () => {
    expect(perRow(23, 11)).toBe(8)
    expect(perRow(23, 12)).toBe(12)
  })

  it('keeps one row when they all fit', () => {
    expect(perRow(23, 30)).toBe(23)
  })

  it('evens out rows that already end full', () => {
    expect(perRow(22, 11)).toBe(11)
  })
})

describe('fitting', () => {
  it('counts the gaps between items, not after the last', () => {
    expect(fitting(392, 32, 4)).toBe(11)
    expect(fitting(428, 32, 4)).toBe(12)
    expect(fitting(10, 32, 4)).toBe(1)
  })
})
