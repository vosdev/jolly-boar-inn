import { cleanup, render, screen } from '@testing-library/svelte'
import { tick } from 'svelte'
import { writable } from 'svelte/store'
import { afterEach, describe, expect, it } from 'vitest'

import { rulesOf } from '../../lib/modeRules'
import { sample } from '../../lib/modes/riddles_of_the_sphinx'
import type { StemTiming } from './props'
import ClueStem from './stems/ClueStem.svelte'
import clueStem from './stems/ClueStem.svelte?raw'

const OPEN = Date.parse('2026-11-19T20:00:00Z')
const CLUES = sample.view.clues as string[]
const STEPS = rulesOf('riddles_of_the_sphinx')?.steps ?? null

afterEach(cleanup)

function ladder(secondsIn: number, revealed = false) {
  const now = writable(OPEN + secondsIn * 1000)
  const timing: StemTiming = {
    answerableAt: new Date(OPEN).toISOString(),
    endsAt: new Date(OPEN + 60_000).toISOString(),
    now,
    steps: STEPS,
  }
  render(ClueStem, { data: { ...sample.view }, revealed, timing })
  return now
}

function shown(): string[] {
  return CLUES.filter((clue) => screen.queryByText(clue) !== null)
}

function current(): string | null {
  return document.querySelector('.now .clue')?.textContent ?? null
}

describe('the clue ladder', () => {
  it('has a step a clue, every 10 s of 60 and the last for 20', () => {
    expect(STEPS).toEqual({ build: 4, of: 6 })
  })

  it('shows no clue during the hold and the first at `answerable_at`', async () => {
    const now = ladder(-1)
    expect(shown()).toEqual([])
    now.set(OPEN)
    await tick()
    expect(shown()).toEqual(CLUES.slice(0, 1))
    expect(current()).toBe(CLUES[0])
  })

  it.each([
    [9.9, 1],
    [10.1, 2],
    [20.1, 3],
    [30.1, 4],
    [40.1, 5],
    [59.9, 5],
  ])('at %s s shows %s clues, the last of them new', (seconds, count) => {
    ladder(seconds)
    expect(shown()).toEqual(CLUES.slice(0, count))
    expect(current()).toBe(CLUES[count - 1])
  })

  it('shows no points on the ladder', () => {
    ladder(25)
    for (const points of ['1000', '850', '700', '550', '400']) {
      expect(document.body.textContent).not.toContain(points)
    }
  })

  it('keeps a hidden clue’s room, so its arrival does not grow the stage', () => {
    ladder(12)
    const hidden = [...document.querySelectorAll<HTMLElement>('.later')]
    expect(hidden.map((rung) => rung.dataset.room)).toEqual(CLUES.slice(2))
  })

  it('keeps a later clue out of the page, not only out of sight', () => {
    ladder(12)
    expect(document.body.textContent).not.toContain(CLUES[2])
    expect(screen.getAllByLabelText(/still hidden/)).toHaveLength(3)
  })

  it('shows a player who reconnects mid-question the clues due by then, and no more', () => {
    ladder(24)
    expect(shown()).toEqual(CLUES.slice(0, 3))
  })

  it('shows every clue at the reveal', () => {
    ladder(2, true)
    expect(shown()).toEqual(CLUES)
    expect(current()).toBeNull()
  })
})

describe('the clue size', () => {
  // jsdom computes no font sizes, so this reads the rule the component ships.
  it('does not grow with the desktop stage’s 1.5 text, so five clues leave room for the list', () => {
    const css = clueStem.slice(clueStem.indexOf('<style>'))
    const size = css.match(/\n\s*\.clue \{[^}]*font-size: ([^;]+);/)?.[1]
    expect(size).toBe('max(1rem, 1.2rem * min(var(--scroll-text, 1), 1))')
  })
})
