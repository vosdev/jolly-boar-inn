/**
 * `formatGp`: the band edges — 99,999 / 100,000 and 9,999,999 / 10,000,000 —
 * and zero, and each edge is here from both sides.
 */

import { describe, expect, it } from 'vitest'

import { formatGp, parseAmount } from './gp'

describe('formatGp', () => {
  it.each([
    [0, '0'],
    [1, '1'],
    [999, '999'],
    [1_000, '1,000'],
    [12_500, '12,500'],
    [99_999, '99,999'],
    [100_000, '100k'],
    [100_999, '100k'],
    [999_999, '999k'],
    [1_000_000, '1M'],
    [1_650_000, '1.6M'],
    [1_699_999, '1.6M'],
    [2_000_000, '2M'],
    [9_999_999, '9.9M'],
    [10_000_000, '10M'],
    [10_999_999, '10M'],
    [145_000_000, '145M'],
    [2_147_483_647, '2147M'],
  ])('writes %i as %s', (amount, written) => {
    expect(formatGp(amount)).toBe(written)
  })

  it('never rounds up, only truncates', () => {
    expect(formatGp(99_999.9)).toBe('99,999')
    expect(formatGp(1_099_999)).toBe('1M')
  })

  it('writes a debt with the same bands', () => {
    expect(formatGp(-12_500)).toBe('-12,500')
    expect(formatGp(-1_650_000)).toBe('-1.6M')
  })

  it('does not print NaN over a button', () => {
    expect(formatGp(Number.NaN)).toBe('?')
    expect(formatGp(Number.POSITIVE_INFINITY)).toBe('?')
  })
})

describe('parseAmount', () => {
  it.each([
    ['0', 0],
    ['1234', 1234],
    ['12,500', 12_500],
    [' 1 234 567 ', 1_234_567],
    ['-3.5', -3.5],
    ['.5', 0.5],
    ['7.', 7],
    ['100k', 100_000],
    ['1.6M', 1_600_000],
    ['1.1m', 1_100_000],
    ['2.1b', 2_100_000_000],
  ])('reads %s as %d', (text, amount) => {
    expect(parseAmount(text)).toBe(amount)
  })

  it.each(['', ' ', 'lots', '1.2.3', '1e5', '10kk', 'k', '-', '1,5m m', 'Infinity', '0x10'])(
    'refuses %j',
    (text) => {
      expect(parseAmount(text)).toBeNull()
    },
  )

  it('reads back what formatGp writes', () => {
    for (const amount of [999, 12_500, 100_000, 1_600_000, 10_000_000]) {
      expect(parseAmount(formatGp(amount))).toBe(amount)
    }
  })
})

describe('formatGp with three figures', () => {
  it('keeps the third figure in millions', () => {
    expect(formatGp(1_650_000, { figures: 3 })).toBe('1.65M')
    expect(formatGp(1_600_000, { figures: 3 })).toBe('1.6M')
    expect(formatGp(12_500_000, { figures: 3 })).toBe('12.5M')
    expect(formatGp(125_000_000, { figures: 3 })).toBe('125M')
    expect(formatGp(125_000, { figures: 3 })).toBe('125k')
    expect(formatGp(1_650_000)).toBe('1.6M')
  })
})
