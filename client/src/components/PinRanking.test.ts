import { render, screen } from '@testing-library/svelte'
import { describe, expect, it } from 'vitest'

import type { PlayerResult } from '../lib/protocol'
import PinRanking from './PinRanking.svelte'

const SARIM = { name: 'Port Sarim', min_x: 3008, max_x: 3060, min_y: 3180, max_y: 3260 }
const NAMES: Record<string, string> = { a: 'SeaShanty', b: 'Fisher', c: 'DeepBlue', me: 'Me' }

function result(x: number, y: number, points: number): PlayerResult {
  return {
    value: [{ x, y }],
    correct: points === 1000,
    credit: points / 1000,
    points,
    item_points: 0,
    item: null,
    by_book: false,
  }
}

describe('PinRanking', () => {
  it('ranks the pins nearest first and lists who placed none', () => {
    render(PinRanking, {
      reveal: { targets: [SARIM], pins: 1, reach: 100 },
      results: { a: result(2143, 3122, 59), me: result(3026, 3213, 1000) },
      unanswered: ['c'],
      nameOf: (id: string) => NAMES[id] ?? null,
      youId: 'me',
    })
    expect(screen.getByText('1 of 3')).toBeTruthy()
    expect(screen.getByText('inside Port Sarim', { exact: false })).toBeTruthy()
    const rows = screen.getAllByRole('listitem').map((row) => row.textContent ?? '')
    expect(rows[0]).toContain('You')
    expect(rows[0]).toContain('+1,000')
    expect(rows[1]).toContain('SeaShanty')
    expect(rows[1]).toContain('867 tiles')
    expect(screen.getByText('No pin: DeepBlue')).toBeTruthy()
  })

  it('counts who got every pin on a several-pin question', () => {
    const towns = [SARIM, { name: 'Rellekka', min_x: 2620, max_x: 2700, min_y: 3620, max_y: 3700 }]
    render(PinRanking, {
      reveal: { targets: towns, pins: 2, reach: 100 },
      results: {
        b: {
          value: [
            { x: 3028, y: 3217 },
            { x: 2660, y: 3740 },
          ],
          correct: false,
          credit: 0.5,
          points: 983,
          item_points: 0,
          item: null,
          by_book: false,
        },
      },
      unanswered: [],
      nameOf: (id: string) => NAMES[id] ?? null,
      youId: null,
    })
    expect(screen.getByText('got all 2', { exact: false })).toBeTruthy()
    expect(screen.getByText('1 of 2 inside, 20 tiles on average')).toBeTruthy()
  })
})
