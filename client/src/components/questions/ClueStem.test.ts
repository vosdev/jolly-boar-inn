import { cleanup, render, screen } from '@testing-library/svelte'
import { tick } from 'svelte'
import { writable } from 'svelte/store'
import { afterEach, describe, expect, it } from 'vitest'

import { rulesOf } from '../../lib/modeRules'
import { sample } from '../../lib/modes/riddles_of_the_sphinx'
import type { StemTiming } from './props'
import ClueStem from './stems/ClueStem.svelte'

const OPEN = Date.parse('2026-11-19T20:00:00Z')
const CLUES = sample.view.clues as string[]
const STEPS = rulesOf('riddles_of_the_sphinx')?.steps ?? null

afterEach(cleanup)

function ladder(secondsIn: number, revealed = false) {
  const now = writable(OPEN + secondsIn * 1000)
  const timing: StemTiming = {
    answerableAt: new Date(OPEN).toISOString(),
    endsAt: new Date(OPEN + 30_000).toISOString(),
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
  return document.querySelector('.now .points')?.textContent ?? null
}

describe('the clue ladder', () => {
  it('has a step a clue, every 5 s of 30 and the last for 10', () => {
    expect(STEPS).toEqual({ build: 4, of: 6 })
  })

  it('shows no clue during the hold and the first at `answerable_at`', async () => {
    const now = ladder(-1)
    expect(shown()).toEqual([])
    now.set(OPEN)
    await tick()
    expect(shown()).toEqual(CLUES.slice(0, 1))
    expect(current()).toBe('1000')
  })

  it.each([
    [4.9, 1, '1000'],
    [5.1, 2, '850'],
    [10.1, 3, '700'],
    [15.1, 4, '550'],
    [20.1, 5, '400'],
    [29.9, 5, '400'],
  ])('at %s s shows %s clues, on the step paying %s', (seconds, count, points) => {
    ladder(seconds)
    expect(shown()).toEqual(CLUES.slice(0, count))
    expect(current()).toBe(points)
  })

  it('keeps a later clue out of the page, not only out of sight', () => {
    ladder(6)
    expect(document.body.textContent).not.toContain(CLUES[2])
    expect(screen.getAllByLabelText(/still hidden/)).toHaveLength(3)
  })

  it('shows a player who reconnects mid-question the clues due by then, and no more', () => {
    ladder(12)
    expect(shown()).toEqual(CLUES.slice(0, 3))
  })

  it('shows every clue at the reveal', () => {
    ladder(2, true)
    expect(shown()).toEqual(CLUES)
    expect(current()).toBeNull()
  })
})
