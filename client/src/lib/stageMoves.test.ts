import { describe, expect, it } from 'vitest'

import {
  CUT,
  ENTER_MOVE_MS,
  HOST_IN_MS,
  HOST_OUT_MS,
  MOVE_MS,
  WORDS_OUT_MS,
  castOf,
  handoffFor,
} from './stageMoves'

const round = castOf({ host: 'bob_barter' })

describe('handoffFor', () => {
  it('puts the first stage up with no hand-over', () => {
    expect(handoffFor(null, round, true)).toEqual(CUT)
  })

  it('moves only the scroll when the same host stays, the words arriving after it', () => {
    const handoff = handoffFor(round, castOf({ host: 'bob_barter', scene: 'q2' }), true)
    expect(handoff.kind).toBe('same')
    expect(handoff.arrival).toBe(WORDS_OUT_MS + MOVE_MS)
  })

  it('walks one host off and the next on around the move', () => {
    const handoff = handoffFor(round, castOf({ host: 'wise_old_man', tall: true }), true)
    expect(handoff).toEqual({
      kind: 'swap',
      out: HOST_OUT_MS,
      move: MOVE_MS,
      in: HOST_IN_MS,
      arrival: HOST_OUT_MS + MOVE_MS + HOST_IN_MS,
    })
  })

  it('swaps the lobby’s hero for the round’s host, even when it is the same NPC', () => {
    const lobby = castOf({ host: 'wise_old_man', hero: '/hero.png' })
    expect(handoffFor(lobby, castOf({ host: 'wise_old_man' }), true).kind).toBe('swap')
  })

  it('swaps when the host moves to the top of a tall sheet', () => {
    const wom = castOf({ host: 'wise_old_man' })
    expect(handoffFor(wom, castOf({ host: 'wise_old_man', tall: true }), true).kind).toBe('swap')
  })

  it('swaps when the host steps up above the sheet to speak, and moves only words after', () => {
    const beside = castOf({ host: 'bob_barter' })
    const above = castOf({ host: 'bob_barter', speaks: true })
    expect(handoffFor(beside, above, true).kind).toBe('swap')
    expect(
      handoffFor(above, castOf({ host: 'bob_barter', speaks: true, scene: 'q1' }), true).kind,
    ).toBe('same')
  })

  it('keeps the stage as it is when a question goes from open to revealed', () => {
    const open = castOf({ host: 'bob_barter', scene: 'q1' })
    expect(handoffFor(open, castOf({ host: 'bob_barter', scene: 'q1' }), true)).toEqual(CUT)
  })

  it('clears the sheet before a random event’s entrance slides the scroll', () => {
    const event = castOf({ host: 'bob_barter', guest: 'evil_bob', entering: true })
    expect(handoffFor(round, event, true)).toEqual({
      kind: 'enter',
      out: WORDS_OUT_MS,
      move: ENTER_MOVE_MS,
      in: 0,
      arrival: WORDS_OUT_MS + ENTER_MOVE_MS,
    })
  })

  it('cuts to a random event already standing', () => {
    const event = castOf({ host: 'bob_barter', guest: 'evil_bob' })
    expect(handoffFor(round, event, true)).toEqual(CUT)
  })

  it('swaps an event NPC still standing for the host', () => {
    const event = castOf({ host: 'bob_barter', guest: 'evil_bob', scene: 'q1' })
    expect(handoffFor(event, castOf({ host: 'bob_barter', scene: 'q2' }), true).kind).toBe('swap')
  })

  it('cuts when the words could not wait for the hand-over', () => {
    const late = castOf({ host: 'bob_barter', scene: 'q2', within: WORDS_OUT_MS + MOVE_MS - 1 })
    expect(handoffFor(round, late, true)).toEqual(CUT)
  })

  it('cuts under reduced motion', () => {
    expect(handoffFor(round, castOf({ host: 'wise_old_man', tall: true }), false)).toEqual(CUT)
  })
})
