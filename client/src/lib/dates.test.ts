/** The rough "time left" a room shows: hours, never a clock time. */

import { describe, expect, it } from 'vitest'

import { dailyDate, expiresIn, finishedAt, finishedDay } from './dates'

const NOW = Date.parse('2026-10-04T12:00:00Z')
const hours = (count: number): number => NOW + count * 3_600_000

describe('expiresIn', () => {
  it('counts whole hours, rounding down so it never promises more than is left', () => {
    expect(expiresIn(hours(31.9), NOW)).toBe('in 31 hours')
    expect(expiresIn(hours(2), NOW)).toBe('in 2 hours')
  })

  it('says 1 hour in the singular', () => {
    expect(expiresIn(hours(1.5), NOW)).toBe('in 1 hour')
  })

  it('has nothing finer than an hour', () => {
    expect(expiresIn(hours(0.9), NOW)).toBe('in under an hour')
    expect(expiresIn(NOW, NOW)).toBe('in under an hour')
  })

  it('switches to days from 48 hours', () => {
    expect(expiresIn(hours(47.9), NOW)).toBe('in 47 hours')
    expect(expiresIn(hours(48), NOW)).toBe('in 2 days')
    expect(expiresIn(hours(80), NOW)).toBe('in 3 days')
  })
})

describe('finishedAt', () => {
  it('says the day and the clock in the reader’s zone', () => {
    const iso = new Date(2026, 9, 25, 21, 14).toISOString()
    expect(finishedAt(iso)).toBe('Sun 25 Oct at 21:14')
    expect(finishedDay(iso)).toBe('25 Oct')
  })

  it('gives back what it cannot read', () => {
    expect(finishedAt('soon')).toBe('soon')
    expect(finishedDay('soon')).toBe('soon')
  })
})

describe('dailyDate', () => {
  it('names the day itself, whatever the zone', () => {
    expect(dailyDate('2026-10-31')).toBe('Sat 31 Oct')
  })

  it('hands back what it cannot read', () => {
    expect(dailyDate('soon')).toBe('soon')
  })
})
