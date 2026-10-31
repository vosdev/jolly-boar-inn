import { beforeEach, describe, expect, it } from 'vitest'

import { dailyToken, lastDaily, noteDaily, resumes } from './daily'

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
