import { describe, expect, it } from 'vitest'
import {
  defaultScale,
  middle,
  onTrack,
  pageSteps,
  position,
  roundSig,
  sigStep,
  stepFrom,
  valueAt,
} from './slider'

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

describe('linear track', () => {
  it('stops on every whole number and starts halfway, a half rounded up', () => {
    expect(onTrack(1234, 'linear')).toBe(true)
    expect(onTrack(1234, 'log')).toBe(false)
    expect(middle(1, 99, 'linear')).toBe(50)
    expect(middle(0, 3, 'linear')).toBe(2)
    expect(valueAt(0.5, 0, 10, 'linear')).toBe(5)
    expect(position(25, 0, 100, 'linear')).toBe(0.25)
  })

  it('steps by one and pages by a twentieth of the width', () => {
    expect(stepFrom(98, 1, 1, 99, 'linear')).toBe(99)
    expect(stepFrom(99, 1, 1, 99, 'linear')).toBe(99)
    expect(stepFrom(5, -10, 1, 99, 'linear')).toBe(1)
    expect(pageSteps(0, 15_000, 'linear')).toBe(750)
    expect(pageSteps(1, 10, 'linear')).toBe(1)
    expect(pageSteps(100, 10_000, 'log')).toBe(10)
  })

  it('defaults to log once max is at least 20 times min', () => {
    expect(defaultScale(1, 99)).toBe('log')
    expect(defaultScale(5, 99)).toBe('linear')
    expect(defaultScale(100, 2000)).toBe('log')
    expect(defaultScale(0, 2000)).toBe('linear')
  })
})
