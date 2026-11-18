/**
 * `price_is_right` on screen: the item and the question from `PriceStem`, then a slider
 * between two prices, then — after close — the price, your guess and everyone's.
 */

import { fireEvent, render, screen } from '@testing-library/svelte'
import { readable } from 'svelte/store'
import { describe, expect, it, vi } from 'vitest'

import type { OpenQuestion } from '../../lib/protocol'
import { viewFor } from './index'
import Question from './Question.svelte'
import AssetStem from './stems/AssetStem.svelte'
import PriceStem from './stems/PriceStem.svelte'
import PriceIsRight from './types/PriceIsRight.svelte'

const VIEW = {
  subject: { name: 'Abyssal whip', asset: 'item:4151' },
  min: 110_000,
  max: 300_000,
  as_of: '2026-09-20',
}

const REVEAL = { ...VIEW, value: 130_000 }

function open(view: Record<string, unknown> = VIEW): OpenQuestion {
  return {
    question_id: 'q1',
    index: 0,
    total: 10,
    type: 'price_is_right',
    mode: 'price_is_right',
    segment: { mode: 'price_is_right', index: 0, total: 1, start: 0, count: 10 },
    view,
    opened_at: '2026-09-21T20:00:00Z',
    ends_at: '2026-09-21T20:00:15Z',
    you_can_answer: true,
    picture: null,
    random_event: null,
    answerable_at: '2026-09-21T20:00:00Z',
    answered: 0,
    of: 0,
    waiting: [],
  }
}

const slider = () => screen.getByRole('slider')
const key = (k: string) => fireEvent.keyDown(slider(), { key: k })

describe('price_is_right', () => {
  it('is drawn by the price stem over its own view', () => {
    expect(viewFor('price_is_right', 'price_is_right')).toEqual({
      stem: PriceStem,
      view: PriceIsRight,
    })
  })

  it('starts in the middle and shows the ends and the chosen price in gp', () => {
    render(Question, { question: open(), yourValue: null, onAnswer: () => {} })
    const name = screen.getByText('Abyssal whip')
    expect(name.dataset.asset).toBe('item:4151')
    expect(slider().getAttribute('aria-valuenow')).toBe('182000')
    expect(slider().getAttribute('aria-valuetext')).toBe('182k gp')
    expect(screen.getByText('110k gp')).toBeTruthy()
    expect(screen.getByText('300k gp')).toBeTruthy()
    expect(screen.getByText('Your price').parentElement?.textContent).toContain('182k gp')
    expect(name.compareDocumentPosition(slider()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('steps by keyboard: arrows one, pages ten, Home and End the ends', async () => {
    render(Question, { question: open(), yourValue: null, onAnswer: () => {} })
    const now = () => Number(slider().getAttribute('aria-valuenow'))
    await key('ArrowRight')
    expect(now()).toBe(183_000)
    await key('ArrowLeft')
    await key('ArrowDown')
    expect(now()).toBe(181_000)
    await key('PageUp')
    expect(now()).toBe(191_000)
    await key('PageDown')
    await key('PageDown')
    expect(now()).toBe(171_000)
    await key('Home')
    expect(now()).toBe(110_000)
    await key('End')
    expect(now()).toBe(300_000)
  })

  it('sends the chosen price and locks once sent', async () => {
    const onAnswer = vi.fn()
    render(Question, { question: open(), yourValue: null, onAnswer })
    await key('ArrowUp')
    await fireEvent.click(screen.getByRole('button', { name: 'Submit' }))
    expect(onAnswer).toHaveBeenCalledWith(183_000)
  })

  it('holds a sent guess, and shows only the range to someone who cannot answer', () => {
    const answered = render(Question, { question: open(), yourValue: 250_000, onAnswer: () => {} })
    expect(slider().getAttribute('aria-disabled')).toBe('true')
    expect(slider().getAttribute('aria-valuenow')).toBe('250000')
    expect(screen.queryByRole('button', { name: 'Submit' })).toBeNull()
    answered.unmount()
    render(Question, {
      question: { ...open(), you_can_answer: false },
      yourValue: null,
      onAnswer: () => {},
    })
    expect(screen.queryByRole('slider')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Submit' })).toBeNull()
    expect(screen.getByText('110k gp')).toBeTruthy()
  })

  it('marks the price, your guess and everyone else’s on the reveal', () => {
    const { container } = render(PriceIsRight, {
      data: REVEAL,
      revealed: true,
      yourValue: 147_000,
      canAnswer: true,
      onAnswer: () => {},
      results: {
        a: { value: 147_000, correct: false, credit: 0.6, points: 400, item_points: 0, item: null },
        b: { value: 200_000, correct: false, credit: 0, points: 0, item_points: 0, item: null },
      },
    })
    expect(container.querySelector('.mark.answer')?.getAttribute('data-value')).toBe('130000')
    expect(container.querySelector('.mark.yours')?.getAttribute('data-value')).toBe('147000')
    expect(container.querySelectorAll('.mark.tick')).toHaveLength(2)
    expect(container.textContent).toContain('130k gp')
    expect(container.textContent).toContain('+13%')
    expect(document.body.textContent).not.toContain('as of')
  })

  it('draws the stem as nothing when the subject has no name', () => {
    const timing = {
      answerableAt: '2026-09-21T20:00:00Z',
      endsAt: '2026-09-21T20:00:20Z',
      now: readable(0),
    }
    const { container } = render(AssetStem, { data: { subject: {} }, revealed: false, timing })
    expect(container.textContent?.trim()).toBe('')
  })
})
