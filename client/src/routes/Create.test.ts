/**
 * The create form against T21's `/api/modes`: `custom` is listed there, with no round
 * length, because the host's questions are random events rather than a round. The form
 * must not offer it as one — ticked by default, it would have every room refused — and it
 * sends `random_events` where `order` used to be.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/svelte'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as api from '../lib/api'
import { saveProfile } from '../lib/profile'
import Create from './Create.svelte'

const PACING: api.ModePacing[] = [
  {
    id: 'more_less',
    type: 'more_less',
    questions: { default: 5, min: 1, max: 30 },
    seconds: { default: 10, min: 5, max: 20 },
  },
  {
    id: 'price_is_right',
    type: 'price_is_right',
    questions: { default: 5, min: 1, max: 30 },
    seconds: { default: 10, min: 5, max: 30 },
  },
  { id: 'custom', type: null, questions: null, seconds: { default: 20, min: 10, max: 60 } },
]

vi.mock('../lib/api', async (importOriginal) => {
  const real = await importOriginal<typeof import('../lib/api')>()
  return { ...real, getModes: vi.fn(), createRoom: vi.fn() }
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(api.getModes).mockResolvedValue(structuredClone(PACING))
  vi.mocked(api.createRoom).mockResolvedValue({
    code: 'ABYSSAL',
    session: 's',
    player: { id: 'p', display_name: 'Zezima', role: 'admin', connected: false },
  })
  saveProfile('Zezima')
})

async function submitted(): Promise<api.NewRoomSettings> {
  await fireEvent.click(screen.getByRole('button', { name: 'Create room' }))
  await waitFor(() => expect(api.createRoom).toHaveBeenCalledOnce())
  return vi.mocked(api.createRoom).mock.calls[0][1]
}

/** The form, once `/api/modes` has answered and the rounds are drawn. */
async function loaded(): Promise<void> {
  render(Create, { navigate: () => {} })
  await screen.findByRole('checkbox', { name: /^More or Less/ })
}

describe('Create', () => {
  it('offers every mode but custom as a round', async () => {
    await loaded()
    expect(screen.getByRole('checkbox', { name: /^The Price is Right/ })).toBeTruthy()
    expect(screen.queryByRole('checkbox', { name: /Host's Questions|custom/ })).toBeNull()
    expect(screen.getByText('Rounds (2)')).toBeTruthy()
  })

  it('sends the rounds picked and random events, and no order', async () => {
    await loaded()
    const settings = await submitted()
    expect(settings.modes.map((round) => round.mode)).toEqual(['more_less', 'price_is_right'])
    expect(settings.random_events).toBe(true)
    expect(settings).not.toHaveProperty('order')
  })

  it('lets the host keep the packs from interrupting', async () => {
    await loaded()
    await fireEvent.click(screen.getByRole('checkbox', { name: /Random events/ }))
    expect((await submitted()).random_events).toBe(false)
  })

  it('counts the events a room may add against the cap, as the server does', async () => {
    await loaded()
    await fireEvent.input(screen.getByLabelText('Questions', { selector: '#questions-more_less' }), {
      target: { value: '30' },
    })
    expect(screen.getByText('35 questions in total, and up to 1 random event')).toBeTruthy()
  })

  it('sends how long the standings hold between rounds, 10 unless changed (D9)', async () => {
    await loaded()
    expect((await submitted()).standings_seconds).toBe(10)
  })

  it('takes 0 for no standings, and will not submit past 30', async () => {
    await loaded()
    const field = screen.getByLabelText('Standings between rounds, seconds')
    await fireEvent.input(field, { target: { value: '31' } })
    const create = screen.getByRole('button', { name: 'Create room' }) as HTMLButtonElement
    expect(create.disabled).toBe(true)
    await fireEvent.input(field, { target: { value: '0' } })
    expect(create.disabled).toBe(false)
    expect((await submitted()).standings_seconds).toBe(0)
  })
})
