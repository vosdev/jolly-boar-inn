import { cleanup, render, screen } from '@testing-library/svelte'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { DailyToday } from '../lib/api'
import type { DailyScore } from '../lib/daily'
import DailyPanel from './DailyPanel.svelte'

const TODAY: DailyToday = { day: '2026-10-31', number: 12, next_at: '2026-11-01T08:00:00Z' }
const NOW = Date.parse('2026-10-31T12:00:00Z')

function kept(...days: string[]): DailyScore[] {
  return days
    .map((day) => ({ day, number: 12 - (Date.parse(TODAY.day) - Date.parse(day)) / 86_400_000 }))
    .map(({ day, number }) => ({ day, number, points: 7420, correct: 7, total: 10 }))
    .reverse()
}

function show(scores: DailyScore[]): void {
  render(DailyPanel, { today: TODAY, scores, now: NOW, onplay: () => {} })
}

beforeEach(() => localStorage.clear())
afterEach(cleanup)

describe('the streak on Home', () => {
  it('is a filled pill once today is played', () => {
    show(kept('2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31'))
    const pill = screen.getByText('5 days in a row')
    expect(pill.classList.contains('kept')).toBe(true)
    expect(screen.queryByText(/Play today/)).toBeNull()
  })

  it('is an outline pill and a nudge while yesterday’s run can go on', () => {
    show(kept('2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30'))
    const pill = screen.getByText('5 days in a row')
    expect(pill.classList.contains('kept')).toBe(false)
    expect(screen.getByText('Play today to make it 6.')).toBeTruthy()
  })

  it('is absent after a missed day', () => {
    show(kept('2026-10-28', '2026-10-29'))
    expect(screen.queryByText(/in a row/)).toBeNull()
    expect(screen.queryByText(/Play today/)).toBeNull()
  })

  it('reads one day as one day', () => {
    show(kept('2026-10-31'))
    expect(screen.getByText('1 day in a row')).toBeTruthy()
  })
})
