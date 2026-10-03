/**
 * The interlude's schedule: settled before the answers at any hold, typing at 60 a second
 * from 900 ms when it fits, an intro and its question a pause apart, and no interlude at
 * all where there is no room for one.
 */

import { describe, expect, it } from 'vitest'

import {
  ENTRANCE_MS,
  LETTERS_PER_SECOND,
  PAUSE_MAX_MS,
  PAUSE_MIN_MS,
  READ_LETTERS_PER_SECOND,
  SETTLE_MS,
  SETTLED,
  TYPE_FROM_MS,
  interludeFor,
  typedAt,
} from './interlude'

const HOLD = 6000

/** How long a line types at the natural pace. */
const typing = (letters: number) => (letters * 1000) / LETTERS_PER_SECOND
/** What reading a line still needs once it has typed, per letter. */
const READ_MS_PER_LETTER = 1000 / READ_LETTERS_PER_SECOND - 1000 / LETTERS_PER_SECOND
/** The pause a line's reading asks for, within the shortest and the longest. */
const wanted = (letters: number) =>
  Math.max(PAUSE_MIN_MS, Math.min(PAUSE_MAX_MS, letters * READ_MS_PER_LETTER))
/** Intros whose reading falls short of the shortest pause, inside the range, and past it. */
const BELOW = Math.floor(PAUSE_MIN_MS / READ_MS_PER_LETTER) - 1
const BETWEEN = Math.round((PAUSE_MIN_MS + PAUSE_MAX_MS) / 2 / READ_MS_PER_LETTER)
const ABOVE = Math.ceil(PAUSE_MAX_MS / READ_MS_PER_LETTER) + 1

/** Where a plan's last line stops typing. */
const done = (lines: { from: number; for: number }[]) =>
  Math.max(...lines.map((line) => line.from + line.for))

describe('interludeFor, one line', () => {
  it('types an ordinary prompt at 60 letters a second from 900 ms', () => {
    const plan = interludeFor(HOLD, [60])
    expect(plan).toEqual({ enter: true, lines: [{ from: TYPE_FROM_MS, for: 1000 }] })
    expect(typedAt(plan.lines[0], 60, 900)).toBe(0)
    expect(typedAt(plan.lines[0], 60, 1400)).toBe(30)
    expect(typedAt(plan.lines[0], 60, 1900)).toBe(60)
  })

  it.each([
    [HOLD, 300],
    [3500, 200],
    [1000, 40],
    [1000, 300],
    [600, 120],
  ])('settles a %i ms hold with a %i-letter prompt 200 ms before the answers', (hold, letters) => {
    const plan = interludeFor(hold, [letters])
    expect(plan.enter).toBe(true)
    expect(plan.lines[0]!.from).toBeGreaterThanOrEqual(ENTRANCE_MS)
    expect(done(plan.lines)).toBeLessThanOrEqual(hold - SETTLE_MS)
    expect(typedAt(plan.lines[0], letters, hold - SETTLE_MS)).toBe(letters)
  })

  it('starts a long prompt sooner, and types faster only when sooner is not enough', () => {
    // 200 letters take 3333 ms at 60 a second; from 400 ms a 3.5 s hold has 2900.
    expect(interludeFor(3500, [200]).lines).toEqual([{ from: ENTRANCE_MS, for: 2900 }])
    // 150 letters take 2500 ms, which fits from 800 ms at the natural speed.
    expect(interludeFor(3500, [150]).lines).toEqual([{ from: 800, for: 2500 }])
  })

  it('has the NPC simply in place with no room for the entrance', () => {
    expect(interludeFor(0, [60])).toEqual(SETTLED)
    expect(interludeFor(500, [60])).toEqual(SETTLED)
    expect(interludeFor(Number.NaN, [60])).toEqual(SETTLED)
    expect(typedAt(SETTLED.lines[0], 60, 0)).toBe(60)
  })
})

describe('interludeFor, an intro and its question', () => {
  it('types the intro, pauses as long as reading it takes, then types the question', () => {
    // The median question: 93 and 61 letters.
    const [intro, ask] = interludeFor(HOLD, [93, 61]).lines
    expect(intro!.from).toBe(TYPE_FROM_MS)
    expect(intro!.for).toBeCloseTo(typing(93))
    expect(ask!.from - (intro!.from + intro!.for)).toBeCloseTo(wanted(93))
    expect(ask!.for).toBeCloseTo(typing(61))
  })

  it('shortens the pause, not the speed, when the longest pause does not fit', () => {
    // A question sized so the lines fit with the shortest pause and not with the longest.
    const room = HOLD - SETTLE_MS - TYPE_FROM_MS
    const asked = Math.floor(
      ((room - typing(ABOVE) - (PAUSE_MIN_MS + PAUSE_MAX_MS) / 2) * LETTERS_PER_SECOND) / 1000,
    )
    const [intro, ask] = interludeFor(HOLD, [ABOVE, asked]).lines
    const pause = ask!.from - (intro!.from + intro!.for)
    expect(pause).toBeGreaterThan(PAUSE_MIN_MS)
    expect(pause).toBeLessThan(PAUSE_MAX_MS)
    expect(intro!.for).toBeCloseTo(typing(ABOVE))
    expect(ask!.for).toBeCloseTo(typing(asked))
    expect(done([intro!, ask!])).toBeCloseTo(HOLD - SETTLE_MS)
  })

  it.each([HOLD, 3500, 1000])('still settles 200 ms before the answers at %i ms', (hold) => {
    const plan = interludeFor(hold, [150, 300])
    expect(plan.lines[0]!.from).toBeGreaterThanOrEqual(ENTRANCE_MS)
    expect(plan.lines[1]!.from).toBeGreaterThan(plan.lines[0]!.from + plan.lines[0]!.for)
    expect(done(plan.lines)).toBeLessThanOrEqual(hold - SETTLE_MS + 1e-9)
  })

  it.each([
    [BELOW, PAUSE_MIN_MS],
    [BETWEEN, BETWEEN * READ_MS_PER_LETTER],
    [ABOVE, PAUSE_MAX_MS],
  ])('waits after a %i-letter intro for %i ms, whatever time is left over', (letters, pause) => {
    const [intro, ask] = interludeFor(HOLD, [letters, 40]).lines
    expect(ask!.from - (intro!.from + intro!.for)).toBeCloseTo(pause)
  })

  it('shows the question not at all until its turn', () => {
    const [intro, ask] = interludeFor(HOLD, [93, 61]).lines
    expect(ask!.from).toBeGreaterThanOrEqual(intro!.from + intro!.for + PAUSE_MIN_MS)
    expect(typedAt(ask, 61, ask!.from - 1)).toBe(0)
  })
})
