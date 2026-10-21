import { describe, expect, it } from 'vitest'
import { middle, position, roundSig, sigStep, stepFrom, valueAt } from './slider'

describe('slider grid', () => {
  it('keeps three significant figures', () => {
    expect(roundSig(1_654_321)).toBe(1_650_000)
    expect(roundSig(999)).toBe(999)
    expect(roundSig(99_950)).toBe(100_000)
    expect(sigStep(125_000)).toBe(1_000)
  })

  it('starts in the middle of the log track', () => {
    expect(middle(110_000, 300_000)).toBe(182_000)
    expect(position(middle(1_000, 100_000), 1_000, 100_000)).toBeCloseTo(0.5, 2)
  })

  it('maps the track ends to min and max', () => {
    expect(valueAt(0, 1_100_000, 3_000_000)).toBe(1_100_000)
    expect(valueAt(1, 1_100_000, 3_000_000)).toBe(3_000_000)
    expect(valueAt(2, 1_100_000, 3_000_000)).toBe(3_000_000)
  })

  it('steps one grid value at a time, across a power of ten', () => {
    expect(stepFrom(99_800, 1, 95_000, 200_000)).toBe(99_900)
    expect(stepFrom(99_900, 1, 95_000, 200_000)).toBe(100_000)
    expect(stepFrom(100_000, 1, 95_000, 200_000)).toBe(101_000)
    expect(stepFrom(100_000, -1, 95_000, 200_000)).toBe(99_900)
    expect(stepFrom(110_000, 10, 110_000, 300_000)).toBe(120_000)
  })

  it('stops at the ends', () => {
    expect(stepFrom(299_000, 10, 110_000, 300_000)).toBe(300_000)
    expect(stepFrom(111_000, -10, 110_000, 300_000)).toBe(110_000)
  })

  it('has about 190 positions from 110k to 300k', () => {
    let count = 1
    for (let v = 110_000; v < 300_000; v = stepFrom(v, 1, 110_000, 300_000)) count++
    expect(count).toBe(191)
  })
})
