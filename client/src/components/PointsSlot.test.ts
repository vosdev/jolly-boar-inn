/**
 * D8: the points slot's four outcomes (section 7.2), and the running total under them.
 * A timeout must not read as a wrong answer: it says "No answer" and carries no ✗.
 */

import { render } from '@testing-library/svelte'
import { describe, expect, it } from 'vitest'

import PointsSlot from './PointsSlot.svelte'

const earned = (container: HTMLElement) => container.querySelector('.earned')?.textContent?.trim()

describe('PointsSlot', () => {
  it('shows a right answer with a ✓, over the running total', () => {
    const { container } = render(PointsSlot, {
      result: { value: 0, correct: true, credit: 1, points: 850 },
      canAnswer: true,
      total: 9270,
    })
    expect(container.querySelector('.slot')?.classList.contains('right')).toBe(true)
    expect(earned(container)).toBe('✓+850')
    expect(container.querySelector('.total')?.textContent).toBe('9,270')
  })

  it('shows a wrong answer as +0 with a ✗', () => {
    const { container } = render(PointsSlot, {
      result: { value: 1, correct: false, credit: 0, points: 0 },
      canAnswer: true,
      total: 0,
    })
    expect(container.querySelector('.slot')?.classList.contains('wrong')).toBe(true)
    expect(earned(container)).toBe('✗+0')
  })

  it('shows a timeout as "No answer · +0", with no ✗', () => {
    const { container } = render(PointsSlot, { result: null, canAnswer: true, total: 400 })
    expect(earned(container)).toBe('No answer · +0')
    expect(container.textContent).not.toContain('✗')
    expect(container.querySelector('.slot')?.classList.contains('none')).toBe(true)
  })

  it('lets a graded guess be its number, with neither glyph', () => {
    const { container } = render(PointsSlot, {
      result: { value: 99, correct: false, credit: 0.34, points: 340 },
      canAnswer: true,
      total: 1340,
    })
    expect(earned(container)).toBe('+340')
  })

  it('says a question that was never ours was not scored', () => {
    const { container } = render(PointsSlot, { result: null, canAnswer: false, total: null })
    expect(earned(container)).toBe('Not scored')
    expect(container.querySelector('.total')).toBeNull()
  })

  it('says the whole slot in words to a screen reader', () => {
    const { container } = render(PointsSlot, {
      result: { value: 0, correct: true, credit: 1, points: 850 },
      canAnswer: true,
      total: 9270,
    })
    expect(container.querySelector('.sr')?.textContent).toBe('Right, +850 points. 9,270 in total.')
  })
})
