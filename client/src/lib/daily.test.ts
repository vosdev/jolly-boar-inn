import { beforeEach, describe, expect, it } from 'vitest'

import { dailyToken, lastDaily, noteDaily, resumes, shareText, type DailyResult } from './daily'

beforeEach(() => localStorage.clear())

describe('the daily token', () => {
  it('is made once and kept', () => {
    const token = dailyToken()
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(dailyToken()).toBe(token)
  })
})

describe('the last attempt', () => {
  it('reads back what was noted', () => {
    expect(lastDaily()).toBeNull()
    noteDaily({ day: '2026-10-31', finished: false })
    expect(lastDaily()).toEqual({ day: '2026-10-31', finished: false })
  })

  it('ignores what it cannot read', () => {
    localStorage.setItem('jbi:daily:last', '{"day": 3}')
    expect(lastDaily()).toBeNull()
  })

  it.each([
    [null, false],
    [{ day: '2026-10-30', finished: false }, true],
    [{ day: '2026-10-30', finished: true }, false],
    [{ day: '2026-10-31', finished: true }, true],
  ])('resumes from %o: %s', (last, expected) => {
    expect(resumes(last, '2026-10-31')).toBe(expected)
  })
})

describe('the share text', () => {
  const RESULT: DailyResult = {
    day: '2026-11-11',
    number: 12,
    points: 7420,
    correct: 7,
    results: [
      'right',
      'right',
      'partial',
      'right',
      'missed',
      'right',
      'right',
      'missed',
      'partial',
      'right',
    ],
  }

  it('holds the day, the score, the row and the link', () => {
    expect(shareText(RESULT, 'https://jollyboar.example')).toBe(
      'Daily #12: 7/10 · 7,420\n🟩🟩🟨🟩🟥🟩🟩🟥🟨🟩\nhttps://jollyboar.example/daily',
    )
  })

  it('shows partial credit as yellow', () => {
    const partial: DailyResult = { ...RESULT, correct: 0, results: Array(10).fill('partial') }
    expect(shareText(partial, 'https://x.example').split('\n')[1]).toBe('🟨'.repeat(10))
  })

  it('gives away no answer', () => {
    const text = shareText(RESULT, 'https://jollyboar.example')
    expect(text.split('\n')).toHaveLength(3)
    expect(text).not.toMatch(/answer|whip|price/i)
  })
})
