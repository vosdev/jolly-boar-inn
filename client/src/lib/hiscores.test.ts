/**
 * The hiscores' arranging, wording and timing: the final's places fifth to first, the
 * moves since the round before, the order the rows start in, and when each part plays.
 */

import { describe, expect, it } from 'vitest'

import {
  CEREMONY,
  ceremonyPlaces,
  ceremonyTimes,
  movement,
  placeLine,
  pointsBefore,
  previousOrder,
  roundLine,
  shuffleTimes,
  TIERS,
  winnersLine,
} from './hiscores'
import type { Standing } from './protocol'

function standing(
  name: string,
  points: number,
  rank: number,
  gained = points,
  previous: number | null = null,
): Standing {
  return {
    player_id: name,
    display_name: name,
    avatar: null,
    points,
    rank,
    points_gained: gained,
    previous_rank: previous,
  }
}

describe('ceremonyPlaces', () => {
  it('presents fifth first and first last, Bronze up to Diamond', () => {
    const places = ceremonyPlaces(
      [1, 2, 3, 4, 5, 6].map((rank) => standing(`p${rank}`, 700 - rank * 100, rank)),
    )
    expect(places.map((place) => [place.rank, place.tier])).toEqual([
      [5, 'bronze'],
      [4, 'silver'],
      [3, 'gold'],
      [2, 'platinum'],
      [1, 'diamond'],
    ])
    expect(TIERS).toEqual(['diamond', 'platinum', 'gold', 'silver', 'bronze'])
  })

  it('presents tied players together, and past three pets the rest as +N', () => {
    const tied = ['a', 'b', 'c', 'd'].map((name) => standing(name, 500, 2))
    const places = ceremonyPlaces([standing('top', 900, 1), ...tied])
    const second = places.find((place) => place.rank === 2)!
    expect(second.standings.map((s) => s.player_id)).toEqual(['a', 'b', 'c', 'd'])
    expect(second.shown.map((s) => s.player_id)).toEqual(['a', 'b', 'c'])
    expect(second.more).toBe(1)
    expect(placeLine(second)).toBe('Tied for second…')
  })

  it('gives nobody on 0 points a place, so a quiet room has no ceremony', () => {
    expect(ceremonyPlaces([standing('a', 300, 1), standing('b', 0, 2)]).map((p) => p.rank)).toEqual(
      [1],
    )
    expect(ceremonyPlaces([standing('a', 0, 1), standing('b', 0, 1)])).toEqual([])
  })
})

describe('movement', () => {
  it('says up or down by how many places, and nothing when level or in the first round', () => {
    expect(movement(standing('a', 900, 1, 500, 3))).toEqual({ up: true, by: 2 })
    expect(movement(standing('a', 900, 4, 0, 2))).toEqual({ up: false, by: 2 })
    expect(movement(standing('a', 900, 2, 100, 2))).toBeNull()
    expect(movement(standing('a', 900, 1))).toBeNull()
  })
})

describe('previousOrder', () => {
  it('starts the rows where they stood before the round, the total then included', () => {
    const now = [standing('b', 900, 1, 800, 2), standing('a', 700, 2, 0, 1)]
    expect(previousOrder(now, ['a', 'b']).map((s) => s.player_id)).toEqual(['a', 'b'])
    expect(now.map(pointsBefore)).toEqual([100, 700])
  })

  it('starts the first round in join order, a player gone from the room last', () => {
    const now = [standing('c', 900, 1), standing('gone', 500, 2), standing('a', 300, 3)]
    expect(previousOrder(now, ['a', 'c']).map((s) => s.player_id)).toEqual(['a', 'c', 'gone'])
  })
})

describe('the Wise Old Man', () => {
  it('opens each standings with the round just played', () => {
    expect(roundLine(2)).toBe('Round 2 done. Let’s see who truly knows Gielinor best.')
  })

  it('names one winner, several, or nobody', () => {
    expect(winnersLine(['Zezima'])).toBe('Gz, Zezima! Here are the full hiscores.')
    expect(winnersLine(['A', 'B', 'C'])).toBe('Gz, A, B and C! Here are the full hiscores.')
    expect(winnersLine([])).toBe('Nobody scored. A quiet night at the inn.')
  })
})

describe('timing', () => {
  it('types each line at 50 letters a second, then holds each place, first the longest', () => {
    // The intro, then fifth's and first's lines: 25, 15 and 20 letters.
    const times = ceremonyTimes([25, 15, 20])
    expect(times.lines).toEqual([300, 300 + 500 + 1050, 1850 + 300 + 600 + 2850])
    expect(times.shows).toEqual([1850 + 300 + 600, 5600 + 400 + 600])
    expect(times.end).toBe(6600 + CEREMONY.holdFirst)
  })

  it('counts the gains once the line has typed, and moves the rows a second later', () => {
    expect(shuffleTimes(50)).toEqual({ settle: 1600, move: 2600, pin: 3250 })
  })
})
