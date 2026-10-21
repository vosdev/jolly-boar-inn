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
import type { PlayerView, Segment } from '../lib/protocol'
import { serverOffsetMs } from '../lib/stores'
import { petsDrawn } from '../test-pets'
import { seen, spoken, typing } from '../test-typing'
import Splash from './Splash.svelte'

const SEGMENT: Segment = { mode: 'more_less', index: 0, total: 2, start: 0, count: 5 }

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

const fill = () => (document.querySelector('.fill') as HTMLElement).style.width

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

describe('Splash stage', () => {
  it("writes the mode's name and blurb on the scroll, and its count under the line", () => {
    splash()
    const heading = screen.getByRole('heading', { name: 'More or Less' })
    expect(paper().contains(heading)).toBe(true)
    expect(paper().textContent).toContain(MODES.more_less!.blurb)
    expect(under().textContent).toContain('Round 1 of 2 · 5 questions')
    // A round's questions each take their own type's time, so no one length is true.
    expect(under().textContent).not.toContain('seconds')
    expect(paper().textContent).not.toContain('Round 1 of 2')
  })

  it('dates a price round under the line, rounded for The Price is Right', () => {
    pricesAsOf.byMode = { more_less: '2026-09-01', price_is_right: '2026-10-08' }
    splash()
    expect(under().textContent).toContain(`Prices as of ${asOfDate('2026-09-01')}.`)
    expect(paper().textContent).not.toContain('as of')
    cleanup()
    splash({ ...SEGMENT, mode: 'price_is_right' })
    expect(under().textContent).toContain(
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
    expect(paper().querySelector('.blurb')).toBeNull()
  })

  it("has the mode's host greet the room on the scroll, between the name and the blurb", () => {
    splash()
    const lines = [...paper().querySelectorAll('h2, p')].map(spoken)
    expect(lines).toEqual([
      'More or Less',
      `“${MODES.more_less!.greeting}”`,
      MODES.more_less!.blurb,
    ])
  })

  it('has the innkeeper present a mode this build lacks, in the generic greeting', () => {
    splash({ ...SEGMENT, mode: 'zoom_quiz' })
    expect(paper().textContent).toContain(GENERIC_HOST.greeting)
    for (const img of document.querySelectorAll<HTMLImageElement>('.npc.host img')) {
      expect(img.getAttribute('src')).toBe(npcArt(FALLBACK_NPC).url)
    }
  })

  it('has the host beside the scroll', () => {
    splash()
    expect(document.querySelector('.stage-row .npc.host img')).toBeTruthy()
  })

  it('keeps the ready check off the parchment', () => {
    splash()
    const button = screen.getByRole('button', { name: "✓ I'm ready" })
    expect(under().contains(button)).toBe(true)
    expect(paper().querySelector('button, ul')).toBeNull()
  })

  it('puts the count and the ready check on a panel, never on the bare page', () => {
    splash()
    const panel = under().querySelector('.panel')!
    expect(panel.textContent).toContain('Round 1 of 2 · 5 questions')
    expect(panel.contains(screen.getByRole('button', { name: "✓ I'm ready" }))).toBe(true)
  })
})

describe('Splash ready check', () => {
  it('shows each connected player as their pet with their name under it, and who is ready', () => {
    splash(SEGMENT, true)
    const list = screen.getByRole('list', { name: '1 of 2 ready' })
    const rows = within(list).getAllByRole('listitem')
    expect(rows.map((row) => row.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
      'Zezima ready',
      'Woox not ready',
    ])
    expect(petsDrawn(list)).toEqual([
      { pet: '', size: 48 },
      { pet: '', size: 48 },
    ])
    expect(rows.map((row) => row.querySelector('.roster-pet')?.classList.contains('lit'))).toEqual([
      true,
      false,
    ])
  })

  it('keeps an away player in the row, faded and marked away, out of the count', () => {
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
    const rows = within(screen.getByRole('list', { name: '1 of 2 ready' })).getAllByRole('listitem')
    expect(rows.map((row) => row.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
      'Zezima ready',
      'Woox not ready',
      'Lynx away ready',
    ])
    expect(rows.map((row) => row.querySelector('.roster-pet')?.classList.contains('away'))).toEqual(
      [false, false, true],
    )
  })
})

describe('Splash ready button', () => {
  it('can be taken back once, and after that stays ready', async () => {
    const onReady = vi.fn()
    const { rerender } = render(Splash, {
      segment: SEGMENT,
      endsAt: null,
      players: players(false),
      youId: 'a',
      onReady,
    })
    await fireEvent.click(screen.getByRole('button', { name: "✓ I'm ready" }))
    expect(onReady).toHaveBeenLastCalledWith(true)
    await rerender({ players: players(true) })

    await fireEvent.click(screen.getByRole('button', { name: '✓ Ready — tap to undo' }))
    expect(onReady).toHaveBeenLastCalledWith(false)
    await rerender({ players: players(false) })

    await fireEvent.click(screen.getByRole('button', { name: "✓ I'm ready" }))
    expect(onReady).toHaveBeenLastCalledWith(true)
    await rerender({ players: players(true) })

    const settled = screen.getByRole('button', { name: '✓ Ready' }) as HTMLButtonElement
    expect(settled.disabled).toBe(true)
    expect(onReady).toHaveBeenCalledTimes(3)
  })
})

describe('Splash countdown bar', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
    vi.setSystemTime(Date.parse('2026-09-25T20:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts full and drains, and a pong moving the offset does not fill it again', async () => {
    render(Splash, {
      segment: SEGMENT,
      endsAt: new Date(Date.now() + 10_000).toISOString(),
      players: players(true),
      youId: 'a',
      onReady: () => {},
    })
    expect(fill()).toBe('100%')
    await vi.advanceTimersByTimeAsync(4_000)
    expect(parseFloat(fill())).toBeCloseTo(60, 0)
    serverOffsetMs.set(5)
    await vi.advanceTimersByTimeAsync(100)
    expect(parseFloat(fill())).toBeCloseTo(59, 0)
  })
})

describe('Splash typing', () => {
  const GREETING = `“${MODES.more_less!.greeting}”`
  const BLURB = MODES.more_less!.blurb
  const greeting = () => paper().querySelector('.greeting')!
  const blurb = () => paper().querySelector('.blurb')!

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
    await fireEvent.click(screen.getByRole('button', { name: /I'm ready/ }))
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
