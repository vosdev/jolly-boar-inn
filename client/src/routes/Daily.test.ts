/** `/daily`: Start, a resume on the way back in, and a refusal once today's is played. */

import { cleanup, fireEvent, render, screen } from '@testing-library/svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as api from '../lib/api'
import { ApiFailure } from '../lib/api'
import { dailyToken, lastDaily, noteDaily } from '../lib/daily'
import { profile } from '../lib/profile'
import { getSession } from '../lib/session'
import { resetRoom } from '../lib/stores'
import Daily from './Daily.svelte'

vi.mock('../lib/api', async (importOriginal) => {
  const real = await importOriginal<typeof import('../lib/api')>()
  return { ...real, getDaily: vi.fn(), startDaily: vi.fn() }
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

const TODAY = { day: '2026-10-31', number: 12 }
const navigate = vi.fn()

beforeEach(() => {
  localStorage.clear()
  resetRoom()
  profile.set(null)
  vi.mocked(api.getDaily).mockResolvedValue(TODAY)
  vi.mocked(api.startDaily).mockResolvedValue({ code: 'AbyssalWhip', session: 'secret' })
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

  it('offers Start again the day after a finished one', async () => {
    noteDaily({ day: '2026-10-30', finished: true })
    render(Daily, { navigate })
    await screen.findByRole('button', { name: 'Start' })
    expect(api.startDaily).not.toHaveBeenCalled()
  })

  it('says today’s is played when the server refuses a second', async () => {
    noteDaily({ day: TODAY.day, finished: true })
    vi.mocked(api.startDaily).mockRejectedValue(
      new ApiFailure(409, 'daily_played', 'you have played today’s daily already'),
    )
    render(Daily, { navigate })
    await screen.findByText(/You have played today's daily/)
  })
})
