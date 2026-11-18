/** Which ways of answering a room's how-to explains, and that each one with a Submit says so. */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SHOWN } from '../components/ModeShowcase.svelte'
import type { ModePacing } from './api'
import { HOW_TO_ROWS, allTypes, howToPath, howToViewOf, roomTypes, rowsFor } from './howToPlay'
import type { RoomSettings } from './protocol'

function mode(id: string, types: string[]): ModePacing {
  return { id, types, questions: null, seconds: null, as_of: null }
}

const MODES = [
  mode('more_less', ['more_less']),
  mode('sort_it_out', ['ordering']),
  mode('bestiary', [
    'closest_number',
    'free_text',
    'multiple_choice',
    'ordering',
    'pick_all_that_apply',
  ]),
  mode('whos_that_npc', ['pick_from_list']),
  mode('custom', []),
  mode('random_event', []),
]

const SETTINGS: RoomSettings = {
  modes: [
    { mode: 'more_less', questions: 5 },
    { mode: 'sort_it_out', questions: 3 },
  ],
  mode_order: 'listed',
  random_event_frequency: 'default',
  pace: 'run',
  difficulty: 'mixed',
  standings_seconds: 10,
  close_when_all_answered: true,
  max_players: 50,
  name_wrong_answers: false,
  teams: [],
  items: true,
}

const titles = (types: Set<string>): string[] => rowsFor(types).map((row) => row.title)

describe('roomTypes', () => {
  it("is the rounds' types when the room holds only its rounds", () => {
    expect(titles(roomTypes(SETTINGS, 8, MODES))).toEqual(['One answer', 'Put in order'])
  })

  it('is every type when random events or host questions add to the rounds', () => {
    expect(roomTypes(SETTINGS, 9, MODES)).toEqual(allTypes(MODES))
  })

  it('is every type when the rounds are hidden', () => {
    const hidden = { ...SETTINGS, modes: [], hide_rounds: true }
    expect(roomTypes(hidden, 0, MODES)).toEqual(allTypes(MODES))
  })

  it('is every type when a round is a mode this build no longer offers', () => {
    const gone = { ...SETTINGS, modes: [{ mode: 'release_order', questions: 8 }] }
    expect(roomTypes(gone, 8, MODES)).toEqual(allTypes(MODES))
  })
})

describe('allTypes', () => {
  it('holds what an event may be even without the modes', () => {
    expect(titles(allTypes([]))).toEqual([
      'One answer',
      'Pick all that apply',
      'Put in order',
      'Match them up',
      'Type the answer',
      'Closest number',
      'Slide to your guess',
    ])
  })

  it('lists the combobox only once a mode answers with it', () => {
    expect(titles(allTypes(MODES))).toContain('Pick from a list')
    expect(titles(allTypes(MODES.filter((m) => m.id !== 'whos_that_npc')))).not.toContain(
      'Pick from a list',
    )
  })
})

describe('rows', () => {
  it('share one row for the two one-tap types', () => {
    for (const type of ['multiple_choice', 'more_less']) {
      expect(titles(new Set([type]))).toEqual(['One answer'])
    }
  })

  it('say Submit for every type that has one, and only for those', () => {
    const tapped = new Set(['multiple_choice', 'more_less'])
    for (const row of HOW_TO_ROWS) {
      expect(row.text.includes('Submit'), row.title).toBe(
        !row.types.some((type) => tapped.has(type)),
      )
    }
  })
})

it('shares one row, drawn as a slider, for the two slider types', () => {
  for (const type of ['price_is_right', 'number_slider']) {
    const rows = rowsFor(new Set([type]))
    expect(rows.map((row) => [row.title, row.drawing])).toEqual([['Slide to your guess', 'slider']])
  }
})

describe('How to play addresses', () => {
  it('spell a mode by its name', () => {
    expect(howToPath('more_less', SHOWN)).toBe('/how-to-play/more-or-less')
    expect(howToPath('whos_that_npc', SHOWN)).toBe('/how-to-play/who-is-that-npc')
    expect(howToPath('events', SHOWN)).toBe('/how-to-play/random-events')
    expect(howToPath('overview', SHOWN)).toBe('/how-to-play')
  })

  it('read back as the view they were made from, each mode its own', () => {
    const paths = new Set<string>()
    for (const view of ['overview', 'events', ...SHOWN.map((mode) => mode.id)]) {
      const path = howToPath(view, SHOWN)
      paths.add(path)
      expect(howToViewOf(path, SHOWN)).toBe(view)
    }
    expect(paths.size).toBe(SHOWN.length + 2)
  })

  it('give the overview for a mode they do not know, and nothing outside the page', () => {
    expect(howToViewOf('/how-to-play/scrying-pool', SHOWN)).toBe('overview')
    expect(howToViewOf('/how-to-playground', SHOWN)).toBeNull()
    expect(howToViewOf('/', SHOWN)).toBeNull()
  })
})

describe('loadModes', () => {
  let get: ReturnType<typeof vi.fn<typeof fetch>>

  beforeEach(() => {
    vi.resetModules()
    get = vi.fn<typeof fetch>().mockImplementation(() => Promise.resolve(Response.json(MODES)))
    vi.stubGlobal('fetch', get)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fetches once per page, and again after a failure', async () => {
    get.mockRejectedValueOnce(new TypeError('offline'))
    const { loadModes } = await import('./howToPlay')
    await expect(loadModes()).rejects.toThrow()
    await Promise.all([loadModes(), loadModes()])
    expect(get).toHaveBeenCalledTimes(2)
  })
})
