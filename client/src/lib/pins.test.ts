import { describe, expect, it } from 'vitest'

import fixtures from './mapPins.fixture.json'
import {
  filledPins,
  nearestPin,
  pairedCredit,
  pairPins,
  pinRows,
  pinsOf,
  placed,
  type PinTarget,
} from './pins'

const SARIM: PinTarget = {
  name: 'Port Sarim',
  min_x: 3008,
  max_x: 3060,
  min_y: 3180,
  max_y: 3260,
}

describe('the server pairs pins the same way', () => {
  it.each(fixtures)('$about', (fixture) => {
    const reach = fixture.scored_reach
    expect(pairPins(fixture.pins, fixture.targets, reach)).toEqual(fixture.pairing)
    expect(pairedCredit(fixture.pins, fixture.targets, reach)).toBeCloseTo(fixture.credit, 9)
  })
})

describe('placed', () => {
  it('counts from the edge and sends the line to the nearest tile', () => {
    const [pin] = placed([{ x: 3070, y: 3300 }], [SARIM], 100)
    expect(pin?.off).toBeCloseTo(Math.hypot(10, 40))
    expect(pin?.to).toEqual({ x: 3060, y: 3260 })
  })

  it('is 0 tiles off anywhere in the box', () => {
    expect(placed([{ x: 3010, y: 3259 }], [SARIM], 100)[0]?.off).toBe(0)
  })
})

describe('pinRows', () => {
  const results = {
    far: { value: [{ x: 2143, y: 3122 }], correct: false, credit: 0, points: 0 },
    near: { value: [{ x: 3026, y: 3213 }], correct: true, credit: 1, points: 1000 },
    nobody: { value: null, correct: false, credit: 0, points: 0 },
  }

  it('ranks the pins nearest first and leaves out who has none', () => {
    const rows = pinRows(results, [SARIM], 100)
    expect(rows.map((row) => row.id)).toEqual(['near', 'far'])
    expect(rows[0]?.inside).toBe(1)
    expect(rows[1]?.inside).toBe(0)
    expect(Math.round(rows[1]?.off ?? 0)).toBe(867)
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
