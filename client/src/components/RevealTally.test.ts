/**
 * D8: the lines under a reveal. The count always, and one per partial-credit band that
 * anyone reached; the names of who got it wrong only when the host asked for them, and
 * never a player who came within 70% or did not answer.
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

function draw(results: Record<string, PlayerResult>, showNames: boolean, youId = 'a') {
  return render(RevealTally, { results, nameOf, youId, showNames })
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
    const near: PlayerResult = { value: 99, correct: false, credit: 0.8, points: 800 }
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

  it('says so when nobody answered', () => {
    const { container } = draw({}, true)
    expect(container.textContent?.trim()).toBe('Nobody answered this one.')
  })

  it('names somebody who has since left without their name', () => {
    const { container } = draw({ z: wrong }, true)
    expect(container.querySelector('.wrong')?.textContent).toContain('Someone who left')
  })
})
