/**
 * The splash: its mode on the clue scroll as it unrolls, and under the line a ready check
 * that counts heads and never names anyone; one take-back per splash; and a countdown bar
 * that a `pong` moving the clock offset does not fill up again.
 */

import { fireEvent, render, screen } from '@testing-library/svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { GENERIC_HOST, MODES } from '../lib/modes'
import { FALLBACK_NPC, npcArt } from '../lib/npcs'
import type { PlayerView, Segment } from '../lib/protocol'
import { serverOffsetMs } from '../lib/stores'
import Splash from './Splash.svelte'

const SEGMENT: Segment = { mode: 'more_less', index: 0, total: 2, start: 0, count: 5 }

function players(youReady: boolean): PlayerView[] {
  return [
    { id: 'a', display_name: 'Zezima', role: 'player', connected: true, ready: youReady },
    { id: 'b', display_name: 'Woox', role: 'player', connected: true, ready: false },
  ]
}

const fill = () => (document.querySelector('.fill') as HTMLElement).style.width

afterEach(() => {
  serverOffsetMs.set(0)
})

function splash(segment: Segment = SEGMENT, youReady = false) {
  return render(Splash, {
    segment,
    endsAt: null,
    questionSeconds: 10,
    players: players(youReady),
    youId: 'a',
    onReady: () => {},
  })
}

const paper = () => document.querySelector('.paper') as HTMLElement
const under = () => document.querySelector('.under') as HTMLElement

describe('Splash stage', () => {
  it("writes the mode's name and blurb on the scroll, and its count and pace under the line", () => {
    splash()
    const heading = screen.getByRole('heading', { name: 'More or Less' })
    expect(paper().contains(heading)).toBe(true)
    expect(paper().textContent).toContain(MODES.more_less!.blurb)
    expect(under().textContent).toContain('Round 1 of 2 · 5 questions · 10 seconds each')
    expect(paper().textContent).not.toContain('Round 1 of 2')
  })

  it('heads a mode this build lacks with its id, and makes up no blurb', () => {
    splash({ ...SEGMENT, mode: 'zoom_quiz' })
    expect(screen.getByRole('heading', { name: 'zoom_quiz' })).toBeTruthy()
    expect(paper().querySelector('.blurb')).toBeNull()
  })

  it("has the mode's host greet the room on the scroll, between the name and the blurb", () => {
    splash()
    const lines = [...paper().querySelectorAll('h2, p')].map((line) => line.textContent)
    expect(lines).toEqual(['More or Less', `“${MODES.more_less!.greeting}”`, MODES.more_less!.blurb])
  })

  it('has the innkeeper present a mode this build lacks, in the generic greeting', () => {
    splash({ ...SEGMENT, mode: 'zoom_quiz' })
    expect(paper().textContent).toContain(GENERIC_HOST.greeting)
    for (const img of document.querySelectorAll<HTMLImageElement>('.npc.host img')) {
      expect(img.getAttribute('src')).toBe(npcArt(FALLBACK_NPC).url)
    }
  })

  it('unrolls the scroll as it comes up, with the host beside it', () => {
    splash()
    expect(document.querySelector('.scroll')!.classList.contains('opening')).toBe(true)
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
    expect(panel.textContent).toContain('Round 1 of 2 · 5 questions · 10 seconds each')
    expect(panel.contains(screen.getByRole('button', { name: "✓ I'm ready" }))).toBe(true)
  })
})

describe('Splash ready check', () => {
  it('counts who is ready by heads and names nobody', () => {
    splash(SEGMENT, true)
    expect(screen.getByRole('list', { name: '1 of 2 ready' })).toBeTruthy()
    expect(document.body.textContent).not.toContain('Woox')
    expect(document.body.textContent).not.toContain('Zezima')
  })
})

describe('Splash ready button', () => {
  it('can be taken back once, and after that stays ready', async () => {
    const onReady = vi.fn()
    const { rerender } = render(Splash, {
      segment: SEGMENT,
      endsAt: null,
      questionSeconds: 10,
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
      questionSeconds: 10,
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
