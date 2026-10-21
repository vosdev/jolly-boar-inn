/** The how-to sheet: the room's ways of answering, Submit in bold, and the scoring line. */

import { cleanup, fireEvent, render, screen } from '@testing-library/svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ModePacing } from '../lib/api'
import { loadModes } from '../lib/howToPlay'
import type { RoomSettings } from '../lib/protocol'
import HowToPlay from './HowToPlay.svelte'

const MODES: ModePacing[] = [
  { id: 'more_less', types: ['more_less'], questions: null, seconds: null, as_of: null },
  { id: 'sort_it_out', types: ['ordering'], questions: null, seconds: null, as_of: null },
]

const SETTINGS: RoomSettings = {
  modes: [{ mode: 'sort_it_out', questions: 5 }],
  mode_order: 'listed',
  random_event_frequency: 'default',
  pace: 'run',
  standings_seconds: 10,
  close_when_all_answered: true,
  max_players: 50,
  name_wrong_answers: false,
  teams: [],
}

vi.mock('../lib/howToPlay', async (importOriginal) => {
  const real = await importOriginal<typeof import('../lib/howToPlay')>()
  return { ...real, loadModes: vi.fn() }
})

beforeEach(() => {
  vi.mocked(loadModes).mockResolvedValue(MODES)
})

afterEach(() => {
  cleanup()
})

describe('HowToPlay', () => {
  it("shows only the lobby room's ways of answering, Submit in bold", async () => {
    render(HowToPlay, { room: { settings: SETTINGS, total: 5 }, onclose: () => {} })
    const order = await screen.findByRole('heading', { name: 'Put in order' })
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(1)
    expect(order.nextElementSibling?.querySelector('strong')?.textContent).toBe('Submit')
    expect(screen.getByText('Quicker and correct answers score more.')).toBeTruthy()
  })

  it('shows every way of answering from Home', async () => {
    render(HowToPlay, { onclose: () => {} })
    await screen.findByRole('heading', { name: 'One answer' })
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      'One answer',
      'Pick all that apply',
      'Put in order',
      'Match them up',
      'Type the answer',
      'Closest number',
      'Slide to a number',
    ])
  })

  it('still explains what an event may be when the modes fail to load', async () => {
    vi.mocked(loadModes).mockRejectedValue(new TypeError('offline'))
    render(HowToPlay, { room: { settings: SETTINGS, total: 5 }, onclose: () => {} })
    expect(await screen.findByRole('heading', { name: 'Type the answer' })).toBeTruthy()
  })

  it('closes on Got it', async () => {
    const onclose = vi.fn()
    render(HowToPlay, { onclose })
    await fireEvent.click(screen.getByRole('button', { name: 'Got it' }))
    expect(onclose).toHaveBeenCalledOnce()
  })
})
