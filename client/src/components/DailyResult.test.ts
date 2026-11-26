import { cleanup, fireEvent, render, screen } from '@testing-library/svelte'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { DailyResult } from '../lib/daily'
import DailyResultScreen from './DailyResult.svelte'

const RESULT: DailyResult = {
  day: '2026-11-11',
  number: 12,
  points: 7420,
  correct: 7,
  others: null,
  beaten: null,
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

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('the daily’s end screen', () => {
  it('shows the day, right answers, points and the row', () => {
    render(DailyResultScreen, { result: RESULT, streak: 1, onHome: () => {} })
    expect(screen.getByRole('heading', { name: 'Daily #12' })).toBeTruthy()
    expect(screen.getByText('7/10')).toBeTruthy()
    expect(screen.getByText('7,420')).toBeTruthy()
    const row = screen.getByRole('list', { name: 'Your answers' })
    const squares = [...row.querySelectorAll('[aria-hidden="true"]')].map((one) => one.textContent)
    expect(squares.join('')).toBe('🟩🟩🟨🟩🟥🟩🟩🟥🟨🟩')
    expect(screen.getAllByText(/Question \d+: partly right/)).toHaveLength(2)
  })

  it('copies the share text', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    render(DailyResultScreen, { result: RESULT, streak: 1, onHome: () => {} })
    await fireEvent.click(screen.getByRole('button', { name: 'Copy result' }))
    expect(writeText).toHaveBeenCalledWith(
      `I scored 7,420 on daily challenge #12 at The Jolly Boar Inn. Think you can do better?\n🟩🟩🟨🟩🟥🟩🟩🟥🟨🟩\n${location.origin}/daily`,
    )
    await screen.findByRole('button', { name: 'Copied' })
  })

  it('shows the text to copy by hand when the clipboard refuses', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'))
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    render(DailyResultScreen, { result: RESULT, streak: 1, onHome: () => {} })
    await fireEvent.click(screen.getByRole('button', { name: 'Copy result' }))
    const field = await screen.findByRole<HTMLTextAreaElement>('textbox', { name: 'Your result' })
    expect(field.value).toContain('I scored 7,420 on daily challenge #12')
  })

  it('shows the share of today’s others beaten and the streak', () => {
    render(DailyResultScreen, {
      result: { ...RESULT, others: 148, beaten: 92 },
      streak: 5,
      onHome: () => {},
    })
    expect(screen.getByText('62%')).toBeTruthy()
    expect(screen.getByText("of today's 148 players beaten")).toBeTruthy()
    expect(screen.getByText('5')).toBeTruthy()
    expect(screen.getByText('days in a row')).toBeTruthy()
  })

  it('shows the streak alone while the server sends no comparison', () => {
    render(DailyResultScreen, { result: RESULT, streak: 1, onHome: () => {} })
    expect(screen.queryByText(/players beaten/)).toBeNull()
    expect(screen.getByText('day in a row')).toBeTruthy()
  })
})
