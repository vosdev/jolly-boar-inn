import { beforeEach, describe, expect, it } from 'vitest'

import {
  dailyScores,
  dailyToken,
  lastDaily,
  noteDaily,
  numberOn,
  resumes,
  saveScore,
  shareText,
  type DailyResult,
} from './daily'

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
      'I scored 7,420 on daily challenge #12 at The Jolly Boar Inn. Think you can do better?\n🟩🟩🟨🟩🟥🟩🟩🟥🟨🟩\nhttps://jollyboar.example/daily',
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

describe('the scores kept here', () => {
  const RESULT: DailyResult = {
    day: '2026-10-31',
    number: 12,
    points: 7420,
    correct: 7,
    results: Array<'right'>(10).fill('right'),
  }
  const on = (day: string, number: number): DailyResult => ({ ...RESULT, day, number })

  it('lists every day newest first, however they were saved', () => {
    saveScore(on('2026-10-29', 10))
    saveScore(on('2026-10-31', 12))
    saveScore(on('2026-10-30', 11))
    expect(dailyScores().map((score) => score.number)).toEqual([12, 11, 10])
  })

  it('keeps a day once, however often the result is shown', () => {
    saveScore(on('2026-10-31', 12))
    saveScore(on('2026-10-31', 12))
    expect(dailyScores()).toHaveLength(1)
  })

  it('keeps the score and the number of questions', () => {
    saveScore(RESULT)
    expect(dailyScores()[0]).toEqual({
      day: RESULT.day,
      number: RESULT.number,
      points: RESULT.points,
      correct: RESULT.correct,
      total: RESULT.results.length,
    })
  })

  it('has nothing to show from broken storage', () => {
    for (const bad of ['not json', '{"day":"2026-10-31"}', 'null', '12']) {
      localStorage.setItem('jbi:daily:scores', bad)
      expect(dailyScores()).toEqual([])
    }
  })

  it('leaves out a row that makes no sense and keeps the others', () => {
    saveScore(RESULT)
    const good = JSON.parse(localStorage.getItem('jbi:daily:scores')!) as unknown[]
    const broken = [null, 'x', { day: 'never', number: 1, points: 1, correct: 1, total: 1 }]
    localStorage.setItem(
      'jbi:daily:scores',
      JSON.stringify([...broken, ...good, { day: RESULT.day }]),
    )
    expect(dailyScores()).toHaveLength(1)
  })
})

describe('numberOn', () => {
  it('counts back from today', () => {
    const today = { day: '2026-10-31', number: 12 }
    expect(numberOn('2026-10-31', today)).toBe(12)
    expect(numberOn('2026-10-30', today)).toBe(11)
  })
})
