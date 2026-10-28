/** Home's game modes: every round once, in a shuffled order, held while someone is looking at it. */

import { act, cleanup, fireEvent, render, screen } from '@testing-library/svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as interlude from '../lib/interlude'
import { MODES, UPCOMING_MODES } from '../lib/modes'
import { npcArt } from '../lib/npcs'
import ModeShowcase, { ADVANCE_MS, SHOWN } from './ModeShowcase.svelte'

/** A draw of 1 - ε leaves the shuffle as it was, so most tests can name slides by `SHOWN`. */
function unshuffled(): void {
  vi.spyOn(Math, 'random').mockReturnValue(0.999999)
}

beforeEach(() => {
  vi.useFakeTimers()
  unshuffled()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const onpick = vi.fn()

function current(): HTMLElement {
  const on = document.querySelectorAll<HTMLElement>('.slide.on')
  expect(on).toHaveLength(1)
  return on[0] as HTMLElement
}

async function wait(ms: number): Promise<void> {
  await act(() => vi.advanceTimersByTime(ms))
}

describe('ModeShowcase', () => {
  it('shows every playable mode once per cycle, with its chathead, name, hint and host', async () => {
    vi.mocked(Math.random).mockRestore()
    render(ModeShowcase, { onpick })
    const seen: string[] = []
    for (let i = 0; i < SHOWN.length; i++) {
      const slide = current()
      const mode = MODES[slide.dataset.mode ?? ''] as (typeof SHOWN)[number]
      seen.push(mode.id)
      expect(slide.querySelector('img')?.getAttribute('src')).toBe(npcArt(mode.host.id).url)
      expect(slide.textContent).toContain(mode.label)
      expect(slide.textContent).toContain(mode.hint)
      expect(slide.textContent).toContain(`Presented by: ${mode.host.name}`)
      await wait(ADVANCE_MS)
    }
    expect([...seen].sort()).toEqual(
      Object.keys(MODES)
        .filter((id) => !['custom', 'random_event', 'random_events_only'].includes(id))
        .sort(),
    )
    expect(current().dataset.mode).toBe(seen[0])
  })

  it('starts each visit on a different shuffle, the chathead row in the same order', () => {
    vi.mocked(Math.random).mockReturnValue(0)
    render(ModeShowcase, { onpick })
    const first = current().dataset.mode
    expect(first).not.toBe(SHOWN[0]?.id)
    const slides = [...document.querySelectorAll<HTMLElement>('.slide')].map(
      (s) => MODES[s.dataset.mode ?? '']?.label,
    )
    const row = [...document.querySelectorAll('.pick')].map((b) => b.getAttribute('aria-label'))
    expect(row).toEqual(slides)
    cleanup()
    unshuffled()
    render(ModeShowcase, { onpick })
    expect(current().dataset.mode).toBe(SHOWN[0]?.id)
  })

  it('never shows random events or upcoming modes', () => {
    render(ModeShowcase, { onpick })
    const ids = [...document.querySelectorAll<HTMLElement>('.slide')].map((s) => s.dataset.mode)
    for (const never of ['random_event', 'random_events_only', 'custom']) {
      expect(ids).not.toContain(never)
    }
    for (const upcoming of UPCOMING_MODES) expect(ids).not.toContain(upcoming.id)
  })

  it('draws every slide in one cell, so the tallest sets the height', () => {
    render(ModeShowcase, { onpick })
    const slides = document.querySelectorAll('.slide')
    expect(slides).toHaveLength(SHOWN.length)
    for (const slide of slides) expect(slide.parentElement?.classList).toContain('stack')
    const inert = [...document.querySelectorAll<HTMLElement>('.slide')].filter((s) => s.inert)
    expect(inert).toHaveLength(SHOWN.length - 1)
    expect(inert).not.toContain(current())
  })

  it('advances after 4.5 s and not before', async () => {
    render(ModeShowcase, { onpick })
    await wait(ADVANCE_MS - 1)
    expect(current().dataset.mode).toBe(SHOWN[0]?.id)
    await wait(1)
    expect(current().dataset.mode).toBe(SHOWN[1]?.id)
  })

  it('stays put while hovered, and moves on again once left', async () => {
    render(ModeShowcase, { onpick })
    const region = screen.getByRole('region', { name: 'Game modes' })
    await fireEvent.pointerEnter(region)
    await wait(ADVANCE_MS * 3)
    expect(current().dataset.mode).toBe(SHOWN[0]?.id)
    await fireEvent.pointerLeave(region)
    await wait(ADVANCE_MS)
    expect(current().dataset.mode).toBe(SHOWN[1]?.id)
  })

  it('stays put while a chathead has keyboard focus', async () => {
    render(ModeShowcase, { onpick })
    const first = screen.getByRole('button', { name: SHOWN[0]?.label })
    vi.spyOn(first, 'matches').mockImplementation((selector) => selector === ':focus-visible')
    await fireEvent.focusIn(first)
    await wait(ADVANCE_MS * 3)
    expect(current().dataset.mode).toBe(SHOWN[0]?.id)
    await fireEvent.focusOut(first, { relatedTarget: document.body })
    await wait(ADVANCE_MS)
    expect(current().dataset.mode).toBe(SHOWN[1]?.id)
  })

  it('shows the mode whose chathead is clicked', async () => {
    render(ModeShowcase, { onpick })
    const pick = SHOWN[4]
    await fireEvent.click(screen.getByRole('button', { name: pick?.label }))
    expect(current().dataset.mode).toBe(pick?.id)
    expect(screen.getByRole('button', { name: pick?.label }).getAttribute('aria-pressed')).toBe(
      'true',
    )
  })

  it("opens a mode's How to play from its name", async () => {
    render(ModeShowcase, { onpick })
    await fireEvent.click(screen.getByRole('button', { name: `${SHOWN[0]?.label}, how to play` }))
    expect(onpick).toHaveBeenCalledWith(SHOWN[0]?.id)
  })

  it('does not advance by itself with reduced motion', async () => {
    vi.spyOn(interlude, 'reducedMotion').mockReturnValue(true)
    render(ModeShowcase, { onpick })
    await wait(ADVANCE_MS * 3)
    expect(current().dataset.mode).toBe(SHOWN[0]?.id)
    await fireEvent.click(screen.getByRole('button', { name: SHOWN[2]?.label }))
    expect(current().dataset.mode).toBe(SHOWN[2]?.id)
  })

  it('is a region, not a live one', () => {
    render(ModeShowcase, { onpick })
    const region = screen.getByRole('region', { name: 'Game modes' })
    expect(region.querySelector('[aria-live]')).toBeNull()
    expect(region.hasAttribute('aria-live')).toBe(false)
  })
})
