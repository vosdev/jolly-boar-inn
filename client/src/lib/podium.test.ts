/**
 * The podium's arrangement. Ranks 4 · 2 · 1 · 3 · 5 from left to right, tied players
 * sharing a step and spilling into `+N` past three, and nobody on 0 points standing on it.
 */

import { describe, expect, it } from 'vitest'

import { podium, STEP_ORDER, tableRows, TIERS } from './podium'
import type { Standing } from './protocol'

function standing(name: string, points: number, rank: number): Standing {
  return { player_id: name, display_name: name, avatar: null, points, rank }
}

describe('podium', () => {
  it('reads 4 · 2 · 1 · 3 · 5, Diamond to Bronze on ranks 1 to 5', () => {
    const steps = podium([1, 2, 3, 4, 5, 6].map((rank) => standing(`p${rank}`, 700 - rank * 100, rank)))
    expect(steps.map((step) => step.rank)).toEqual([4, 2, 1, 3, 5])
    expect(STEP_ORDER).toEqual([4, 2, 1, 3, 5])
    expect(steps.map((step) => [step.rank, step.tier])).toEqual([
      [4, 'silver'],
      [2, 'platinum'],
      [1, 'diamond'],
      [3, 'gold'],
      [5, 'bronze'],
    ])
    expect(TIERS).toEqual(['diamond', 'platinum', 'gold', 'silver', 'bronze'])
  })

  it('puts tied players on one step, and past three shows the rest as +N', () => {
    const level = ['a', 'b', 'c', 'd', 'e'].map((name) => standing(name, 500, 1))
    const steps = podium([...level, standing('f', 100, 2)])
    const first = steps[2]!
    const second = steps[3]!
    expect(first.standings.map((s) => s.player_id)).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(first.shown.map((s) => s.player_id)).toEqual(['a', 'b', 'c'])
    expect(first.more).toBe(2)
    expect(second.rank).toBe(3)
    expect(second.standings).toEqual([])
    const platinum = podium([...level, standing('f', 100, 2)])[1]!
    expect(platinum.standings.map((s) => s.player_id)).toEqual(['f'])
    expect(platinum.more).toBe(0)
  })

  it('keeps anyone on 0 points off it, leaving the step empty', () => {
    const steps = podium([standing('a', 300, 1), standing('b', 0, 2), standing('c', 0, 2)])
    expect(steps.find((step) => step.rank === 1)?.standings).toHaveLength(1)
    expect(steps.filter((step) => step.standings.length > 0)).toHaveLength(1)
    expect(podium([standing('a', 0, 1), standing('b', 0, 1)]).every((s) => s.standings.length === 0)).toBe(
      true,
    )
  })
})

describe('tableRows', () => {
  const all = [
    standing('a', 900, 1),
    standing('b', 800, 2),
    standing('c', 700, 3),
    standing('d', 600, 4),
    standing('e', 500, 5),
    standing('f', 400, 6),
    standing('g', 0, 7),
  ]

  it('between rounds is everyone the podium does not show', () => {
    expect(tableRows(all, false).map((s) => s.player_id)).toEqual(['f', 'g'])
    const quiet = [standing('a', 100, 1), standing('b', 0, 2), standing('c', 0, 2)]
    expect(tableRows(quiet, false).map((s) => s.player_id)).toEqual(['b', 'c'])
  })

  it('on the final screen is everyone, ranks 1 to 5 included, in the server order', () => {
    expect(tableRows(all, true).map((s) => s.player_id)).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g'])
  })
})
