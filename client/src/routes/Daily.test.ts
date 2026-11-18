/** `/daily`: Start, a resume on the way back in, and a refusal once today's is played. */

import { cleanup, fireEvent, render, screen } from '@testing-library/svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as api from '../lib/api'
import { ApiFailure } from '../lib/api'
import { dailyScores, dailyToken, lastDaily, noteDaily, type DailyResult } from '../lib/daily'
import { profile } from '../lib/profile'
import { getSession } from '../lib/session'
import { applyServerMessage, resetRoom } from '../lib/stores'
import Daily from './Daily.svelte'

vi.mock('../lib/api', async (importOriginal) => {
  const real = await importOriginal<typeof import('../lib/api')>()
  return { ...real, getDaily: vi.fn(), startDaily: vi.fn(), getDailyResult: vi.fn() }
})

vi.mock('../lib/ws', () => ({
  RoomSocket: class {
    open(): void {}
    close(): void {}
    send(): boolean {
      return true
    }
  },
}))

const TODAY = { day: '2026-10-31', number: 12, next_at: '2026-11-01T08:00:00+00:00' }
const RESULT: DailyResult = {
  day: TODAY.day,
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
const NO_RESULT = new ApiFailure(404, 'no_result', 'no finished daily for that day')
const navigate = vi.fn()

beforeEach(() => {
  localStorage.clear()
  resetRoom()
  profile.set(null)
  vi.mocked(api.getDaily).mockResolvedValue(TODAY)
  vi.mocked(api.startDaily).mockResolvedValue({ code: 'AbyssalWhip', session: 'secret' })
  vi.mocked(api.getDailyResult).mockRejectedValue(NO_RESULT)
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('/daily', () => {
  it('offers Start with the day’s number, and starts under the profile’s name', async () => {
    profile.set({ name: 'Zezima', pet: 'pet_rock' })
    render(Daily, { navigate })
    await screen.findByRole('heading', { name: 'Daily #12' })
    expect(api.startDaily).not.toHaveBeenCalled()
    await fireEvent.click(screen.getByRole('button', { name: 'Start' }))
    await vi.waitFor(() => expect(getSession('AbyssalWhip')).toBe('secret'))
    expect(api.startDaily).toHaveBeenCalledWith(dailyToken(), 'Zezima', 'pet_rock')
    expect(lastDaily()).toEqual({ day: TODAY.day, finished: false })
  })

  it('offers no Start before the first day', async () => {
    vi.mocked(api.getDaily).mockRejectedValue(
      new api.ApiFailure(404, 'daily_not_open', 'the daily has not opened yet'),
    )
    render(Daily, { navigate })
    await screen.findByText('The daily is not available right now.')
    expect(screen.queryByRole('button', { name: 'Start' })).toBeNull()
  })

  it('starts under a made-up name without a profile', async () => {
    render(Daily, { navigate })
    await fireEvent.click(await screen.findByRole('button', { name: 'Start' }))
    const name = vi.mocked(api.startDaily).mock.calls[0]?.[1]
    expect(name).toMatch(/\S/)
  })

  it('resumes an unfinished attempt without asking, even yesterday’s', async () => {
    noteDaily({ day: '2026-10-30', finished: false })
    render(Daily, { navigate })
    await vi.waitFor(() => expect(getSession('AbyssalWhip')).toBe('secret'))
    expect(screen.queryByRole('button', { name: 'Start' })).toBeNull()
    expect(lastDaily()?.day).toBe('2026-10-30')
  })

  it('shows an attempt that ran out while away, and starts nothing', async () => {
    noteDaily({ day: '2026-10-30', finished: false })
    vi.mocked(api.getDailyResult).mockResolvedValue({ ...RESULT, day: '2026-10-30', number: 11 })
    render(Daily, { navigate })
    await screen.findByRole('heading', { name: 'Daily #11' })
    expect(api.startDaily).not.toHaveBeenCalled()
    expect(api.getDailyResult).toHaveBeenCalledWith(dailyToken(), '2026-10-30')
    expect(lastDaily()).toEqual({ day: '2026-10-30', finished: true })
    expect(dailyScores().map((score) => score.number)).toEqual([11])
  })

  it('starts nothing when it cannot tell whether an attempt finished', async () => {
    noteDaily({ day: '2026-10-30', finished: false })
    vi.mocked(api.getDailyResult).mockRejectedValue(new ApiFailure(0, 'unreachable', 'no server'))
    render(Daily, { navigate })
    await screen.findByText('The daily is not available right now.')
    expect(api.startDaily).not.toHaveBeenCalled()
  })

  it('offers Start again the day after a finished one', async () => {
    noteDaily({ day: '2026-10-30', finished: true })
    render(Daily, { navigate })
    await screen.findByRole('button', { name: 'Start' })
    expect(api.startDaily).not.toHaveBeenCalled()
  })

  it('shows the result on a second visit that day', async () => {
    noteDaily({ day: TODAY.day, finished: true })
    vi.mocked(api.startDaily).mockRejectedValue(
      new ApiFailure(409, 'daily_played', 'you have played today’s daily already', undefined, {
        result: RESULT,
      }),
    )
    render(Daily, { navigate })
    await screen.findByRole('heading', { name: 'Daily #12' })
    expect(screen.getByRole('button', { name: 'Copy your result' })).toBeTruthy()
    expect(api.getDailyResult).not.toHaveBeenCalled()
  })

  it('takes the refused day from the server, past a rollover on the intro', async () => {
    const next = { ...RESULT, day: '2026-11-01', number: 13 }
    vi.mocked(api.startDaily).mockRejectedValue(
      new ApiFailure(409, 'daily_played', 'you have played today’s daily already', undefined, {
        result: next,
      }),
    )
    render(Daily, { navigate })
    await fireEvent.click(await screen.findByRole('button', { name: 'Start' }))
    await screen.findByRole('heading', { name: 'Daily #13' })
    expect(lastDaily()).toEqual({ day: '2026-11-01', finished: true })
    expect(dailyScores().map((score) => score.day)).toEqual(['2026-11-01'])
  })

  it('shows the result for the attempt’s own day when it finishes', async () => {
    noteDaily({ day: '2026-10-30', finished: false })
    render(Daily, { navigate })
    await vi.waitFor(() => expect(getSession('AbyssalWhip')).toBe('secret'))
    vi.mocked(api.getDailyResult).mockResolvedValue({ ...RESULT, day: '2026-10-30', number: 11 })
    applyServerMessage({
      t: 'welcome',
      room: {
        code: 'AbyssalWhip',
        status: 'finished',
        settings: {
          modes: [],
          mode_order: 'listed',
          random_event_frequency: 'default',
          pace: 'run',
          difficulty: 'mixed',
          standings_seconds: 0,
          close_when_all_answered: true,
          max_players: 1,
          name_wrong_answers: false,
          teams: [],
          items: true,
        },
        current_index: 9,
        total: 10,
        events: 0,
        phase: 'idle',
        next_at: null,
        reveal_seconds: null,
        estimated_seconds: 0,
        played: [],
        segment: null,
        finished_at: '2026-10-31T08:05:00Z',
        daily: { day: '2026-10-30', number: 11 },
      },
      you: {
        id: 'a',
        display_name: 'Zezima',
        role: 'player',
        connected: true,
        avatar: null,
        ready: false,
        editing: false,
        team: null,
        item: null,
      },
      players: [],
      question: null,
      your_answer: null,
      standings: [],
      team_standings: null,
      server_time: new Date().toISOString(),
      server_version: __APP_VERSION__,
    })
    await screen.findByRole('button', { name: 'Copy your result' })
    expect(api.getDailyResult).toHaveBeenCalledWith(dailyToken(), '2026-10-30')
    expect(dailyScores().map((score) => score.number)).toEqual([11])
    expect(lastDaily()).toEqual({ day: '2026-10-30', finished: true })
  })
})
