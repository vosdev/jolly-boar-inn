/** `avatar ?? derived(id)`: the one rule for which head a player wears. */

import { describe, expect, it } from 'vitest'

import { derivedHead, HEAD_COUNT, headOf } from './heads'

const ID = '5b0c7e1e-3a0e-4d8e-9a55-0c2f1e0f9d11'

describe('headOf', () => {
  it('draws the head a player chose', () => {
    expect(headOf({ id: ID, avatar: 7 })).toBe(7)
    expect(headOf({ id: ID, avatar: 0 })).toBe(0)
  })

  it('derives one from the id for a player who never chose, the same in every case', () => {
    expect(headOf({ id: ID, avatar: null })).toBe(derivedHead(ID))
    expect(headOf({ id: ID })).toBe(derivedHead(ID))
    expect(headOf({ id: ID.toUpperCase(), avatar: null })).toBe(derivedHead(ID))
  })

  it('derives one for a head this build has no picture of, rather than drawing a gap', () => {
    for (const avatar of [HEAD_COUNT, -1, 2.5]) {
      expect(headOf({ id: ID, avatar })).toBe(derivedHead(ID))
    }
  })
})
