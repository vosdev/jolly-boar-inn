/**
 * `formatGp`: T19 asks for the band edges — 99,999 / 100,000 and 9,999,999 / 10,000,000 —
 * and zero, and each edge is here from both sides.
 */

import { describe, expect, it } from 'vitest'

import { formatGp } from './gp'

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
