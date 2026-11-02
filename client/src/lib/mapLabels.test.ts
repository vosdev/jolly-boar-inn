import { describe, expect, it } from 'vitest'

import { placeLabels, type PinLabel } from './mapLabels'

const FRAME = { width: 800, height: 600 }

function label(id: string, x: number, y: number): PinLabel {
  return { id, x, y, width: 80, height: 34, pet: 40 }
}

describe('placeLabels', () => {
  it('puts a label under a pin with room', () => {
    expect(placeLabels([label('a', 400, 300)], FRAME).get('a')).toBe('below')
  })

  it('moves a label off the frame’s edge', () => {
    expect(placeLabels([label('a', 400, 590)], FRAME).get('a')).toBe('right')
  })

  it('gives the first pin dealt its place and the next another', () => {
    const spots = placeLabels([label('far', 400, 300), label('near', 405, 300)], FRAME)
    expect(spots.get('far')).toBe('below')
    expect(spots.get('near')).not.toBe('below')
    expect(spots.get('near')).not.toBeNull()
  })

  it('drops a label with nowhere clear to go', () => {
    const pile = Array.from({ length: 12 }, (_, index) => label(String(index), 400, 300))
    const spots = placeLabels(pile, FRAME)
    expect([...spots.values()].filter((spot) => spot === null).length).toBeGreaterThan(0)
    expect(spots.get('0')).toBe('below')
  })
})
