/** The how-to sheet: the room's ways of answering, Submit in bold, scoring and teams. */

import { cleanup, fireEvent, render, screen } from '@testing-library/svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ModePacing } from '../lib/api'
import { SCORING_LINE, TEAMS_PARAGRAPH, loadModes } from '../lib/howToPlay'
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
  difficulty: 'mixed',
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
      'Slide to your guess',
    ])
  })

  it('draws the slider row as a slider, not a typed box', async () => {
    render(HowToPlay, { onclose: () => {} })
    const slide = await screen.findByRole('heading', { name: 'Slide to your guess' })
    const drawing = slide.closest('li')?.querySelector('.drawing')
    expect(drawing?.querySelector('.rail .thumb')).not.toBeNull()
    expect(drawing?.querySelector('.box')).toBeNull()
  })

  it('still explains what an event may be when the modes fail to load', async () => {
    vi.mocked(loadModes).mockRejectedValue(new TypeError('offline'))
    render(HowToPlay, { room: { settings: SETTINGS, total: 5 }, onclose: () => {} })
    expect(await screen.findByRole('heading', { name: 'Type the answer' })).toBeTruthy()
  })

  it('explains teams in place of the speed line in a team room', async () => {
    const settings = { ...SETTINGS, teams: ['saradomin', 'zamorak'] } satisfies RoomSettings
    render(HowToPlay, { room: { settings, total: 5 }, onclose: () => {} })
    await screen.findByRole('heading', { name: 'Put in order' })
    expect(document.querySelector('.teams')?.textContent).toBe(`Teams. ${TEAMS_PARAGRAPH}`)
    expect(TEAMS_PARAGRAPH).toContain("Speed doesn't count")
    expect(TEAMS_PARAGRAPH).toContain('average')
    expect(TEAMS_PARAGRAPH).toContain('Pixel Hunt is the exception')
    expect(screen.queryByText(SCORING_LINE)).toBeNull()
  })

  it('leaves teams out of a room without them, and shows both lines from Home', async () => {
    render(HowToPlay, { room: { settings: SETTINGS, total: 5 }, onclose: () => {} })
    await screen.findByRole('heading', { name: 'Put in order' })
    expect(document.querySelector('.teams')).toBeNull()
    cleanup()
    render(HowToPlay, { onclose: () => {} })
    await screen.findByRole('heading', { name: 'One answer' })
    expect(screen.getByText(SCORING_LINE)).toBeTruthy()
    expect(document.querySelector('.teams')).not.toBeNull()
  })

  it('closes on Got it', async () => {
    const onclose = vi.fn()
    render(HowToPlay, { onclose })
    await fireEvent.click(screen.getByRole('button', { name: 'Got it' }))
    expect(onclose).toHaveBeenCalledOnce()
  })
})
