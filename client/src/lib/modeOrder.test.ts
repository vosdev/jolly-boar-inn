/** The create picker's order: fixed by a seed kept in this browser, new for each room. */

import { beforeEach, describe, expect, it } from 'vitest'

import { modeSeed, orderModes, rerollModeSeed } from './modeOrder'

const modes = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id) => ({ id }))
const ids = (list: { id: string }[]) => list.map((mode) => mode.id)

beforeEach(() => {
  localStorage.clear()
})

describe('orderModes', () => {
  it('is the same order for the same seed', () => {
    expect(ids(orderModes(modes, 'x'))).toEqual(ids(orderModes([...modes].reverse(), 'x')))
  })

  it('keeps every mode once, and differs between seeds', () => {
    const first = ids(orderModes(modes, 'x'))
    expect([...first].sort()).toEqual(ids(modes))
    const others = ['y', 'z', 'w', 'v'].map((seed) => ids(orderModes(modes, seed)))
    expect(others.some((order) => order.join() !== first.join())).toBe(true)
  })

  it('leaves the others in place when a mode is added', () => {
    const before = ids(orderModes(modes, 'x'))
    const after = ids(orderModes([...modes, { id: 'new' }], 'x')).filter((id) => id !== 'new')
    expect(after).toEqual(before)
  })
})

describe('modeSeed', () => {
  it('stays the same across reads until it is rerolled', () => {
    const seed = modeSeed()
    expect(modeSeed()).toBe(seed)
    rerollModeSeed()
    expect(localStorage.length).toBe(0)
    expect(modeSeed()).not.toBe('')
  })
})
