import { describe, expect, it } from 'vitest'

import fixtures from './mapPins.fixture.json'
import {
  falloff,
  filledPins,
  nearestPin,
  pairedCredit,
  pairPins,
  pinRows,
  pinsOf,
  type PinTarget,
} from './pins'

const SARIM: PinTarget = { name: 'Port Sarim', x: 3028, y: 3217, radius: 40 }

interface FixtureBounds {
  min_x: number
  max_x: number
  min_y: number
  max_y: number
}

function fallOf(bounds?: FixtureBounds): number {
  if (bounds === undefined) return falloff()
  return falloff({
    minX: bounds.min_x,
    maxX: bounds.max_x,
    minY: bounds.min_y,
    maxY: bounds.max_y,
  })
}

describe('the server pairs pins the same way', () => {
  it.each(fixtures)('$about', (fixture) => {
    const fall = fallOf((fixture as { bounds?: FixtureBounds }).bounds)
    expect(pairPins(fixture.pins, fixture.targets, fall)).toEqual(fixture.pairing)
    expect(pairedCredit(fixture.pins, fixture.targets, fall)).toBeCloseTo(fixture.credit, 9)
  })
})

describe('falloff', () => {
  it('is 300 on the whole map', () => {
    expect(falloff()).toBe(300)
  })

  it('is a tenth of a region, up to the whole map', () => {
    expect(falloff({ minX: 3100, maxX: 3400, minY: 2800, maxY: 3000 })).toBe(30)
    expect(falloff({ minX: 0, maxX: 5000, minY: 0, maxY: 10 })).toBe(300)
  })
})

describe('pinRows', () => {
  const results = {
    far: { value: [{ x: 2143, y: 3122 }], correct: false, credit: 0.05, points: 59 },
    near: { value: [{ x: 3026, y: 3213 }], correct: true, credit: 1, points: 1000 },
    nobody: { value: null, correct: false, credit: 0, points: 0 },
  }

  it('ranks the pins nearest first and leaves out who has none', () => {
    const rows = pinRows(results, [SARIM], 300)
    expect(rows.map((row) => row.id)).toEqual(['near', 'far'])
    expect(rows[0]?.inside).toBe(1)
    expect(rows[1]?.inside).toBe(0)
    expect(Math.round(rows[1]?.off ?? 0)).toBe(890)
  })
})

describe('pinsOf', () => {
  it('reads a value and refuses anything else', () => {
    expect(pinsOf([{ x: 1, y: 2 }])).toEqual([{ x: 1, y: 2 }])
    expect(pinsOf(3)).toEqual([])
    expect(pinsOf(null)).toEqual([])
  })
})

describe('filledPins', () => {
  it('repeats the last pin up to the count', () => {
    const one = { x: 1, y: 2 }
    expect(filledPins([one], 3)).toEqual([one, one, one])
  })

  it('sends nothing for no pin', () => {
    expect(filledPins([], 3)).toEqual([])
  })
})

describe('nearestPin', () => {
  it('finds the pin nearest a tile', () => {
    const pins = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ]
    expect(nearestPin(pins, { x: 90, y: 0 })).toBe(1)
  })
})
