/**
 * The interlude's schedule: settled before the answers at any hold, typing at 60 a second
 * from 900 ms when it fits, and no interlude at all where there is no room for one.
 */

import { describe, expect, it } from 'vitest'

import {
  ENTRANCE_MS,
  SETTLE_MS,
  SETTLED,
  TYPE_FROM_MS,
  interludeFor,
  typedAt,
} from './interlude'

const HOLD = 3500

describe('interludeFor', () => {
  it('types an ordinary prompt at 60 letters a second from 900 ms', () => {
    const plan = interludeFor(HOLD, 60)
    expect(plan).toEqual({ enter: true, typeFrom: TYPE_FROM_MS, typeFor: 1000 })
    expect(typedAt(plan, 60, 900)).toBe(0)
    expect(typedAt(plan, 60, 1400)).toBe(30)
    expect(typedAt(plan, 60, 1900)).toBe(60)
  })

  it.each([
    [HOLD, 200],
    [HOLD, 300],
    [1000, 40],
    [1000, 300],
    [600, 120],
  ])('settles a %i ms hold with a %i-letter prompt 200 ms before the answers', (hold, letters) => {
    const plan = interludeFor(hold, letters)
    expect(plan.enter).toBe(true)
    expect(plan.typeFrom).toBeGreaterThanOrEqual(ENTRANCE_MS)
    expect(plan.typeFrom + plan.typeFor).toBeLessThanOrEqual(hold - SETTLE_MS)
    expect(typedAt(plan, letters, hold - SETTLE_MS)).toBe(letters)
  })

  it('starts a long prompt sooner, and types faster only when sooner is not enough', () => {
    // 200 letters take 3333 ms at 60 a second; from 400 ms there are 2900.
    expect(interludeFor(HOLD, 200)).toEqual({ enter: true, typeFrom: ENTRANCE_MS, typeFor: 2900 })
    // 150 letters take 2500 ms, which fits from 800 ms at the natural speed.
    expect(interludeFor(HOLD, 150)).toEqual({ enter: true, typeFrom: 800, typeFor: 2500 })
  })

  it('starts typing as the entrance ends in a one-second hold', () => {
    expect(interludeFor(1000, 60)).toEqual({ enter: true, typeFrom: ENTRANCE_MS, typeFor: 400 })
  })

  it('has the NPC simply in place with no room for the entrance', () => {
    expect(interludeFor(0, 60)).toEqual(SETTLED)
    expect(interludeFor(500, 60)).toEqual(SETTLED)
    expect(interludeFor(Number.NaN, 60)).toEqual(SETTLED)
    expect(typedAt(SETTLED, 60, 0)).toBe(60)
  })
})
