/**
 * D8: the line under a reveal. The count always; the names of who got it wrong only when
 * the host asked for them, and never a player who scored something or did not answer.
 */

import { render } from '@testing-library/svelte'
import { describe, expect, it } from 'vitest'

import type { PlayerResult } from '../lib/protocol'
import RevealTally from './RevealTally.svelte'

const NAMES: Record<string, string> = { a: 'Zezima', b: 'Woox', c: 'Lynx', d: 'Dorn' }
const nameOf = (id: string) => NAMES[id] ?? null

const right = (points = 900): PlayerResult => ({ value: 0, correct: true, credit: 1, points })
const wrong: PlayerResult = { value: 1, correct: false, credit: 0, points: 0 }

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

  it('does not call out a graded guess that scored', () => {
    const near: PlayerResult = { value: 99, correct: false, credit: 0.8, points: 800 }
    const { container } = draw({ a: near, b: wrong }, true)
    expect(container.querySelector('.count')?.textContent?.trim()).toBe('0 of 2 got it right')
    expect(container.querySelector('.wrong')?.textContent).not.toContain('Zezima')
    expect(container.querySelector('.wrong')?.textContent).toContain('Woox')
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
