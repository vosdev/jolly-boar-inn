/**
 * The lines under a reveal. The count always, and one per partial-credit band that
 * anyone reached; the names of who got it wrong only when the host asked for them, and
 * never a player who came within 70% or did not answer. A closest-number question counts
 * its bands as ranks, since its credit is a rank and not how near the guess was, and a
 * pick-all-that-apply question its right picks.
 */

import { render } from '@testing-library/svelte'
import { describe, expect, it } from 'vitest'

import type { PlayerResult } from '../lib/protocol'
import RevealTally from './RevealTally.svelte'

const NAMES: Record<string, string> = {
  a: 'Zezima',
  b: 'Woox',
  c: 'Lynx',
  d: 'Dorn',
  e: 'Alkan',
  f: 'Tehnoobshow',
}
const nameOf = (id: string) => NAMES[id] ?? null

const right = (points = 900): PlayerResult => ({ value: 0, correct: true, credit: 1, points })
const wrong: PlayerResult = { value: 1, correct: false, credit: 0, points: 0 }
const partly = (credit: number): PlayerResult => ({
  value: 1,
  correct: false,
  credit,
  points: Math.round(900 * credit),
})

const lines = (container: HTMLElement) =>
  [...container.querySelectorAll('.count')].map((p) => p.textContent?.replace(/\s+/g, ' ').trim())

function draw(
  results: Record<string, PlayerResult>,
  showNames: boolean,
  youId = 'a',
  type = 'multiple_choice',
  reveal: Record<string, unknown> = {},
) {
  return render(RevealTally, { type, reveal, results, nameOf, youId, showNames })
}

/** A pick-all answer graded as the server does: right picks over right or picked. */
const picks = (answer: number[], value: number[]): PlayerResult => {
  const hits = value.filter((index) => answer.includes(index)).length
  const credit = hits / new Set([...answer, ...value]).size
  return { value, correct: credit === 1, credit, points: Math.round(900 * credit) }
}

describe('RevealTally', () => {
  it('counts who got it right out of who answered', () => {
    const { container } = draw({ a: right(), b: wrong, c: right(700) }, false)
    expect(container.querySelector('.count')?.textContent?.trim()).toBe('2 of 3 got it right')
    expect(container.querySelector('.wrong')).toBeNull()
  })

  it('names who got it wrong when the host asked, alphabetically, marking you', () => {
    const { container } = draw({ a: wrong, b: wrong, c: right(), d: wrong }, true)
    expect(container.querySelector('.wrong')?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'Got it wrong: Dorn, Woox, Zezima (you)',
    )
  })

  it('does not call out a graded guess within 70%', () => {
    const near: PlayerResult = { value: 99, correct: false, credit: 0.9, points: 750 }
    const { container } = draw({ a: near, b: wrong }, true)
    expect(container.querySelector('.count')?.textContent?.trim()).toBe('0 of 2 got it right')
    expect(container.querySelector('.wrong')?.textContent).not.toContain('Zezima')
    expect(container.querySelector('.wrong')?.textContent).toContain('Woox')
  })

  it('counts partial credit once, in the highest band it reached', () => {
    const { container } = draw(
      {
        a: right(),
        b: partly(0.95),
        c: partly(0.9),
        d: partly(0.89),
        e: partly(0.7),
        f: partly(0.69),
      },
      false,
    )
    expect(lines(container)).toEqual([
      '1 of 6 got it right',
      '2 of 6 were at least 90% right',
      '1 of 6 was at least 80% right',
      '1 of 6 was at least 70% right',
    ])
  })

  it('draws no line for a band nobody reached', () => {
    const { container } = draw({ a: partly(0.85), b: partly(0.84), c: wrong }, false)
    expect(lines(container)).toEqual(['0 of 3 got it right', '2 of 3 were at least 80% right'])
  })

  it('draws the one line it always did for a question that is right or wrong', () => {
    const { container } = draw({ a: right(), b: wrong, c: right(700) }, true)
    expect(lines(container)).toEqual(['2 of 3 got it right'])
  })

  it('names as wrong everyone under 70%, whatever they scored', () => {
    const { container } = draw({ a: partly(0.7), b: partly(0.69), c: wrong, d: right() }, true)
    expect(container.querySelector('.wrong')?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'Got it wrong: Lynx, Woox',
    )
  })

  it('counts a closest-number guess by its rank, not as a share right', () => {
    const { container } = draw(
      {
        a: right(1000),
        b: partly(0.9),
        c: partly(0.8),
        d: partly(0.7),
        e: partly(0.7),
        f: wrong,
      },
      false,
      'a',
      'closest_number',
    )
    expect(lines(container)).toEqual([
      '1 of 6 guessed it exactly',
      '1 of 6 was closest',
      '1 of 6 was second closest',
      '2 of 6 were third closest',
    ])
    expect(container.textContent).not.toContain('%')
  })

  it('names as wrong a closest-number guess off the podium', () => {
    const { container } = draw({ a: partly(0.9), b: wrong }, true, 'a', 'closest_number')
    expect(container.querySelector('.wrong')?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'Got it wrong: Woox',
    )
  })

  it('counts a pick-all answer by its right picks, with picks set', () => {
    const answer = [0, 1, 2, 3]
    const { container } = draw(
      {
        a: picks(answer, [0, 1, 4, 5]),
        b: picks(answer, [0, 1, 2, 3]),
        c: picks(answer, [0, 1, 2, 4]),
        d: picks(answer, [1, 2, 4, 5]),
        e: picks(answer, [0, 1, 2, 5]),
      },
      false,
      'a',
      'pick_all_that_apply',
      { options: ['a', 'b', 'c', 'd', 'e', 'f'], answer_indices: answer, picks: 4 },
    )
    expect(lines(container)).toEqual([
      '1 of 5 got it right',
      '2 of 5 got 3 of 4 right',
      '2 of 5 got 2 of 4 right',
    ])
  })

  it('says how many a pick-all answer got wrong when any number could be picked', () => {
    const answer = [0, 2]
    const { container } = draw(
      {
        a: picks(answer, [0, 1, 2]),
        b: picks(answer, [0]),
        c: picks(answer, [0, 1, 2, 3]),
      },
      false,
      'a',
      'pick_all_that_apply',
      { options: ['a', 'b', 'c', 'd'], answer_indices: answer },
    )
    expect(lines(container)).toEqual([
      '0 of 3 got it right',
      '1 of 3 got 2 of 2 right, 1 wrong',
      '1 of 3 got 2 of 2 right, 2 wrong',
      '1 of 3 got 1 of 2 right',
    ])
  })

  it('names as wrong only a pick-all answer with no right pick', () => {
    const answer = [0, 1]
    const { container } = draw(
      { a: picks(answer, [0, 4]), b: picks(answer, [4, 5]), c: picks(answer, answer) },
      true,
      'a',
      'pick_all_that_apply',
      { options: ['a', 'b', 'c', 'd', 'e', 'f'], answer_indices: answer, picks: 2 },
    )
    expect(container.querySelector('.wrong')?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'Got it wrong: Woox',
    )
  })

  it('says so when nobody answered', () => {
    const { container } = draw({}, true)
    expect(container.textContent?.trim()).toBe('Nobody answered this one.')
  })

  it('names somebody who has since left without their name', () => {
    const { container } = draw({ z: wrong }, true)
    expect(container.querySelector('.wrong')?.textContent).toContain('Someone who left')
  })
})
