/**
 * The splash: its mode on the clue scroll as it unrolls, and under the line a ready check
 * that counts heads and never names anyone; one take-back per splash; and a countdown bar
 * that a `pong` moving the clock offset does not fill up again.
 */

import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte'
import { tick } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { asOfDate } from '../lib/dates'
import { LETTERS_PER_SECOND, interludeFor } from '../lib/interlude'
import { GENERIC_HOST, MODES } from '../lib/modes'
import { FALLBACK_NPC, npcArt } from '../lib/npcs'
import { pricesAsOf } from '../lib/pricesAsOf.svelte'
import type { PlayerView, RoomSettings, Segment } from '../lib/protocol'
import { serverOffsetMs } from '../lib/stores'
import { petsDrawn } from '../test-pets'
import { seen, spoken, typing } from '../test-typing'
import Splash from './Splash.svelte'

const SEGMENT: Segment = { mode: 'more_less', index: 0, total: 2, start: 0, count: 5 }
const SETTINGS: RoomSettings = {
  modes: [
    { mode: 'more_less', questions: 5 },
    { mode: 'bestiary', questions: 5 },
    { mode: 'drop_table', questions: 5 },
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
}

function players(youReady: boolean): PlayerView[] {
  return [
    {
      id: 'a',
      display_name: 'Zezima',
      role: 'player',
      connected: true,
      ready: youReady,
      avatar: null,
      editing: false,
      team: null,
    },
    {
      id: 'b',
      display_name: 'Woox',
      role: 'player',
      connected: true,
      ready: false,
      avatar: null,
      editing: false,
      team: null,
    },
  ]
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => new Promise(() => {})),
  )
})

afterEach(() => {
  serverOffsetMs.set(0)
  pricesAsOf.byMode = {}
  vi.unstubAllGlobals()
})

function splash(segment: Segment = SEGMENT, youReady = false) {
  return render(Splash, {
    segment,
    endsAt: null,
    players: players(youReady),
    youId: 'a',
    onReady: () => {},
  })
}

const paper = () => document.querySelector('.paper') as HTMLElement
const under = () => document.querySelector('.under') as HTMLElement
const bubble = () => document.querySelector('.bubble') as HTMLElement

describe('Splash stage', () => {
  it("writes the mode's name, its hint alone, then the round and its questions on the scroll", () => {
    splash()
    const heading = screen.getByRole('heading', { name: 'More or Less' })
    expect(paper().contains(heading)).toBe(true)
    const lines = [...paper().querySelectorAll('h2, p')].map((line) => line.textContent?.trim())
    expect(lines).toEqual(['More or Less', MODES.more_less!.hint, 'Round 1 of 2, 5 questions'])
    expect(paper().textContent).not.toContain(MODES.more_less!.blurb)
    expect(bubble().textContent).toContain(MODES.more_less!.blurb)
  })

  it('says only the questions for a game of one round', () => {
    splash({ ...SEGMENT, total: 1 })
    expect(paper().querySelector('.shape')?.textContent).toBe('5 questions')
  })

  it('dates a price round under the line, rounded for The Price is Right', () => {
    pricesAsOf.byMode = { more_less: '2026-09-01', price_is_right: '2026-10-08' }
    splash()
    expect(paper().textContent).toContain(`Prices as of ${asOfDate('2026-09-01')}.`)
    cleanup()
    splash({ ...SEGMENT, mode: 'price_is_right' })
    expect(paper().textContent).toContain(
      `Grand Exchange prices, rounded, as of ${asOfDate('2026-10-08')}.`,
    )
  })

  it('dates no round without prices', () => {
    pricesAsOf.byMode = { more_less: '2026-09-01' }
    splash({ ...SEGMENT, mode: 'bestiary' })
    expect(under().textContent).not.toContain('as of')
  })

  it('heads a mode this build lacks with its id, and makes up no blurb', () => {
    splash({ ...SEGMENT, mode: 'zoom_quiz' })
    expect(screen.getByRole('heading', { name: 'zoom_quiz' })).toBeTruthy()
    expect(document.querySelector('.blurb')).toBeNull()
  })

  it("has the mode's host greet the room in its bubble, by name, before the blurb", () => {
    splash()
    const lines = [...bubble().querySelectorAll('p')].map(spoken)
    expect(lines).toEqual(['Ali Morrisane', MODES.more_less!.greeting, MODES.more_less!.blurb])
    expect(bubble().classList.contains('on')).toBe(true)
  })

  it('has the house present a mode this build lacks, in the generic greeting', () => {
    splash({ ...SEGMENT, mode: 'zoom_quiz' })
    expect(bubble().textContent).toContain(GENERIC_HOST.greeting)
    for (const img of document.querySelectorAll<HTMLImageElement>('.npc.host img')) {
      expect(img.getAttribute('src')).toBe(npcArt(FALLBACK_NPC).url)
    }
  })

  it('has the host above the scroll, beside its bubble', () => {
    splash()
    expect(document.querySelector('.speaker .npc.host img')).toBeTruthy()
    expect(document.querySelector('.stage-row .npc')).toBeNull()
  })

  it('keeps the ready check off the parchment', () => {
    splash()
    const button = screen.getByRole('switch', { name: 'Ready' })
    expect(under().contains(button)).toBe(true)
    expect(paper().querySelector('button, ul')).toBeNull()
  })

  it('puts tonight and the ready check on panels, never on the bare page', () => {
    splash()
    expect(screen.getByRole('heading', { name: 'Tonight' }).closest('.panel')).not.toBeNull()
    expect(
      screen.getByRole('switch', { name: 'Ready' }).closest('[aria-label="At the table"]'),
    ).not.toBeNull()
  })

  const stopsOf = (which: string) =>
    [...document.querySelectorAll(`.stops.${which} .stop`)].map((stop) => ({
      state: [...stop.classList].find((name) => ['done', 'now', 'next'].includes(name)),
      face: stop.querySelector('.face img') !== null,
      label: stop.querySelector('.label')?.textContent?.trim(),
      mystery: stop.querySelector('.face .mystery')?.textContent ?? null,
    }))

  it('shows every round’s host on tonight’s row, the current one marked, when the order is known', () => {
    const modes = ['bestiary', 'more_less', 'drop_table'].map((mode) => ({ mode, questions: 5 }))
    render(Splash, {
      segment: { mode: 'more_less', index: 1, total: 3, start: 5, count: 5 },
      endsAt: null,
      players: players(false),
      youId: 'a',
      onReady: () => {},
      settings: { ...SETTINGS, modes, mode_order: 'listed' },
    })
    expect(stopsOf('wide')).toEqual([
      { state: 'done', face: true, label: '1', mystery: null },
      { state: 'now', face: true, label: 'More or Less', mystery: null },
      { state: 'next', face: true, label: '3', mystery: null },
    ])
    expect(document.querySelector('[aria-current="step"]')?.textContent).toContain('More or Less')
  })

  it('keeps shuffled rounds a surprise, showing only the current host', () => {
    render(Splash, {
      segment: { mode: 'more_less', index: 1, total: 3, start: 5, count: 5 },
      endsAt: null,
      players: players(false),
      youId: 'a',
      onReady: () => {},
      settings: { ...SETTINGS, mode_order: 'random' },
    })
    expect(stopsOf('wide').map((stop) => stop.face)).toEqual([false, true, false])
  })

  it('shows the host of a round already played on a shuffled night', () => {
    render(Splash, {
      segment: { mode: 'more_less', index: 1, total: 3, start: 5, count: 5 },
      endsAt: null,
      players: players(false),
      youId: 'a',
      onReady: () => {},
      settings: { ...SETTINGS, mode_order: 'random' },
      played: ['drop_table'],
    })
    expect(stopsOf('wide')).toEqual([
      { state: 'done', face: true, label: '1', mystery: null },
      { state: 'now', face: true, label: 'More or Less', mystery: null },
      { state: 'next', face: false, label: '3', mystery: '?' },
    ])
  })

  it('shows the random-event "?" square for a round whose host is unknown', () => {
    render(Splash, {
      segment: { mode: 'more_less', index: 1, total: 3, start: 5, count: 5 },
      endsAt: null,
      players: players(false),
      youId: 'a',
      onReady: () => {},
      settings: { ...SETTINGS, mode_order: 'random' },
    })
    expect(stopsOf('wide').map((stop) => stop.mystery)).toEqual(['?', null, '?'])
  })

  it('holds only the row of rounds on the Tonight panel', () => {
    splash()
    const night = screen.getByRole('heading', { name: 'Tonight' }).closest('.panel') as HTMLElement
    expect(night.querySelector('.starts, .waiting-big, .starting')).toBeNull()
    expect(night.textContent).not.toContain('to be ready')
  })

  it('fits ten rounds in one row, and the nearest five on a phone', () => {
    render(Splash, {
      segment: { mode: 'more_less', index: 3, total: 10, start: 15, count: 5 },
      endsAt: null,
      players: players(false),
      youId: 'a',
      onReady: () => {},
    })
    expect(stopsOf('wide')).toHaveLength(10)
    expect(document.querySelector('.stops.wide .more')).toBeNull()
    expect(stopsOf('narrow').map((stop) => stop.label)).toEqual([
      '2',
      '3',
      'More or Less',
      '5',
      '6',
    ])
  })
})

describe('Splash ready check', () => {
  function names(list: string): string[] {
    return within(screen.getByRole('list', { name: list }))
      .getAllByRole('listitem')
      .map((row) => row.querySelector('.pet-name')?.textContent ?? '')
  }

  it('seats a team game by the room’s gods, each half under its team', () => {
    const [zezima, woox] = players(true)
    render(Splash, {
      segment: SEGMENT,
      endsAt: null,
      players: [
        { ...zezima!, team: 'zamorak' },
        { ...woox!, team: 'saradomin' },
      ],
      youId: 'a',
      onReady: () => {},
      settings: { ...SETTINGS, teams: ['saradomin', 'zamorak'] },
    })
    expect(names('Ready, Zamorak')).toEqual(['Zezima'])
    expect(names('Not ready yet, Saradomin')).toEqual(['Woox'])
  })

  it('splits the table into Ready and Not ready yet, each pet with its name under it', () => {
    splash(SEGMENT, true)
    expect(names('Ready')).toEqual(['Zezima'])
    expect(names('Not ready yet')).toEqual(['Woox'])
    const table = screen.getByRole('group', { name: 'At the table' })
    expect(table.textContent?.replace(/\s+/g, ' ')).toContain('Ready 1')
    expect(table.textContent?.replace(/\s+/g, ' ')).toContain('Not ready yet 1')
    expect(petsDrawn(table)).toEqual([
      { pet: '', size: 48 },
      { pet: '', size: 48 },
    ])
  })

  it('moves a pet up to Ready as its player readies', async () => {
    const { rerender } = render(Splash, {
      segment: SEGMENT,
      endsAt: null,
      players: players(false),
      youId: 'a',
      onReady: () => {},
    })
    expect(screen.queryByRole('list', { name: 'Ready' })).toBeNull()
    expect(names('Not ready yet')).toEqual(['Zezima', 'Woox'])
    await rerender({ players: players(true) })
    expect(names('Ready')).toEqual(['Zezima'])
    expect(names('Not ready yet')).toEqual(['Woox'])
  })

  it('keeps an away player under Not ready yet, faded and marked away, ready or not', () => {
    const away: PlayerView = {
      id: 'c',
      display_name: 'Lynx',
      role: 'player',
      connected: false,
      ready: true,
      avatar: null,
      editing: false,
      team: null,
    }
    render(Splash, {
      segment: SEGMENT,
      endsAt: null,
      players: [...players(true), away],
      youId: 'a',
      onReady: () => {},
    })
    expect(names('Ready')).toEqual(['Zezima'])
    const rows = within(screen.getByRole('list', { name: 'Not ready yet' })).getAllByRole(
      'listitem',
    )
    expect(rows.map((row) => row.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
      'Woox',
      'Lynx away',
    ])
    expect(rows.map((row) => row.querySelector('.table-pet')?.classList.contains('away'))).toEqual([
      false,
      true,
    ])
  })
})

describe('Splash ready switch', () => {
  it('can be taken back once, and after that stays ready', async () => {
    const onReady = vi.fn()
    const { rerender } = render(Splash, {
      segment: SEGMENT,
      endsAt: null,
      players: players(false),
      youId: 'a',
      onReady,
    })
    await fireEvent.click(screen.getByRole('switch', { name: 'Ready' }))
    expect(onReady).toHaveBeenLastCalledWith(true)
    await rerender({ players: players(true) })

    const sw = () => screen.getByRole('switch', { name: 'Ready' }) as HTMLButtonElement
    expect(sw().getAttribute('aria-checked')).toBe('true')
    await fireEvent.click(sw())
    expect(onReady).toHaveBeenLastCalledWith(false)
    await rerender({ players: players(false) })
    expect(sw().getAttribute('aria-checked')).toBe('false')

    await fireEvent.click(sw())
    expect(onReady).toHaveBeenLastCalledWith(true)
    await rerender({ players: players(true) })

    expect(sw().getAttribute('aria-checked')).toBe('true')
    expect(sw().disabled).toBe(true)
    expect(onReady).toHaveBeenCalledTimes(3)
  })
})

describe('Splash countdown', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
    vi.setSystemTime(Date.parse('2026-09-25T20:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('waits for the room, then counts down large once enough are ready, both over the ready switch', async () => {
    const { rerender } = render(Splash, {
      segment: SEGMENT,
      endsAt: null,
      players: players(false),
      youId: 'a',
      onReady: () => {},
    })
    const table = () => document.querySelector('[aria-label="At the table"]') as HTMLElement
    const night = () => screen.getByRole('heading', { name: 'Tonight' }).closest('.panel')
    const aboveSwitch = (line: Element | null) =>
      line !== null &&
      table().contains(line) &&
      !night()!.contains(line) &&
      (line.compareDocumentPosition(screen.getByRole('switch', { name: 'Ready' })) &
        Node.DOCUMENT_POSITION_FOLLOWING) !==
        0
    expect(document.querySelector('.starting')).toBeNull()
    expect(document.querySelector('.waiting-big')?.textContent).toContain('more to be ready')
    expect(aboveSwitch(document.querySelector('.waiting-big'))).toBe(true)
    await rerender({ endsAt: new Date(Date.now() + 10_000).toISOString() })
    expect(aboveSwitch(document.querySelector('.starting'))).toBe(true)
    const starting = () => document.querySelector('.starting')?.textContent?.replace(/\s+/g, ' ')
    expect(starting()).toContain('Starting in 10')
    await vi.advanceTimersByTimeAsync(4_000)
    expect(starting()).toContain('Starting in 6')
    expect(document.querySelector('.starting')?.closest('[aria-live]')).toBeNull()
    expect(document.querySelector('.waiting-big')).toBeNull()
  })
})

describe('Splash typing', () => {
  const GREETING = MODES.more_less!.greeting
  const BLURB = MODES.more_less!.blurb
  const greeting = () => bubble().querySelector('.greeting')!
  const blurb = () => bubble().querySelector('.blurb')!

  async function after(ms: number): Promise<void> {
    await vi.advanceTimersByTimeAsync(ms)
    await tick()
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('has the name whole from the first frame, and types the greeting once the scroll is open', async () => {
    splash()
    expect(screen.getByRole('heading', { name: 'More or Less' })).toBeTruthy()
    expect(seen(greeting())).toBe('')
    await after(299)
    expect(seen(greeting())).toBe('')
    // 50 letters a second from 300 ms: 25 of them half a second in.
    await after(501)
    expect(seen(greeting())).toBe([...GREETING].slice(0, 25).join(''))
    expect(seen(blurb())).toBe('')
  })

  it('pauses after the greeting, then types the blurb at the same pace', async () => {
    const [, typed] = interludeFor(
      Infinity,
      [[...GREETING].length, [...BLURB].length],
      300,
      300,
    ).lines
    splash()
    await after(Math.floor(typed!.from))
    expect(typing(greeting())).toBe(false)
    expect(seen(blurb())).toBe('')
    expect(typed!.for).toBeCloseTo(([...BLURB].length * 1000) / LETTERS_PER_SECOND)
    await after(Math.ceil(typed!.from + typed!.for) - Math.floor(typed!.from))
    expect(typing(blurb())).toBe(false)
    expect(blurb().textContent).toBe(BLURB)
  })

  it('gives a screen reader both lines whole from the first frame', () => {
    splash()
    expect(spoken(greeting())).toBe(GREETING)
    expect(spoken(blurb())).toBe(BLURB)
  })

  it('takes a ready tap while it is still typing', async () => {
    const onReady = vi.fn()
    render(Splash, { segment: SEGMENT, endsAt: null, players: players(false), youId: 'a', onReady })
    await fireEvent.click(screen.getByRole('switch', { name: 'Ready' }))
    expect(onReady).toHaveBeenCalledWith(true)
  })

  it('shows both lines whole with reduced motion', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
    }))
    try {
      splash()
      expect(typing(greeting())).toBe(false)
      expect(typing(blurb())).toBe(false)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('Splash on the TV', () => {
  it('offers no ready button and keeps the ready check on the sheet, with no panel', () => {
    render(Splash, {
      segment: SEGMENT,
      endsAt: null,
      players: players(false),
      youId: null,
      onReady: () => {},
      tv: true,
    })
    expect(screen.queryAllByRole('button')).toEqual([])
    expect(within(paper()).getByRole('list', { name: '0 of 2 ready' })).toBeTruthy()
    expect(within(paper()).getByText('Waiting for 1 more to be ready')).toBeTruthy()
    expect(under()?.textContent?.trim() ?? '').toBe('')
    expect(document.querySelector('.stage.tv.wide')).not.toBeNull()
  })
})
