/**
 * `price_is_right` on screen: the item from `AssetStem`, then four prices written the way
 * the game writes coins, then — after close — which of them it was.
 */

import { fireEvent, render, screen } from '@testing-library/svelte'
import { readable } from 'svelte/store'
import { describe, expect, it, vi } from 'vitest'

import type { OpenQuestion } from '../../lib/protocol'
import { viewFor } from './index'
import Question from './Question.svelte'
import AssetStem from './stems/AssetStem.svelte'
import PriceIsRight from './types/PriceIsRight.svelte'

const VIEW = {
  subject: { name: 'Abyssal whip', asset: 'item:4151' },
  options: [1_100_000, 1_600_000, 2_100_000, 29_000_000],
  as_of: '2026-09-20',
}

const REVEAL = { ...VIEW, value: 1_600_000, answer_index: 1 }

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
  }
}

const prices = () => screen.getAllByRole('button').map((button) => button.textContent?.trim())

describe('price_is_right', () => {
  it('is drawn by the asset stem over its own view', () => {
    expect(viewFor('price_is_right', 'price_is_right')).toEqual({
      stem: AssetStem,
      view: PriceIsRight,
    })
  })

  it('names the item above four prices in game notation, in the order sent', () => {
    render(Question, { question: open(), yourValue: null, onAnswer: () => {} })
    const name = screen.getByText('Abyssal whip')
    expect(name.dataset.asset).toBe('item:4151')
    expect(prices()).toEqual(['1.1M gp', '1.6M gp', '2.1M gp', '29M gp'])
    const first = screen.getAllByRole('button')[0]!
    expect(name.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.queryByText('correct')).toBeNull()
  })

  it('answers with the index of the price picked', async () => {
    const onAnswer = vi.fn()
    render(Question, { question: open(), yourValue: null, onAnswer })
    await fireEvent.click(screen.getByText('2.1M'))
    expect(onAnswer).toHaveBeenCalledWith(2)
  })

  it('holds the buttons once answered, and for someone who cannot answer', () => {
    const answered = render(Question, { question: open(), yourValue: 0, onAnswer: () => {} })
    expect(screen.getAllByRole('button').every((b) => (b as HTMLButtonElement).disabled)).toBe(
      true,
    )
    expect(screen.getAllByRole('button')[0]!.getAttribute('aria-pressed')).toBe('true')
    answered.unmount()
    render(Question, {
      question: { ...open(), you_can_answer: false },
      yourValue: null,
      onAnswer: () => {},
    })
    expect(screen.getAllByRole('button').every((b) => (b as HTMLButtonElement).disabled)).toBe(
      true,
    )
    expect(screen.getByText('This one is not scored for you — sit back and watch.')).toBeTruthy()
  })

  it('lights the right price on the reveal and keeps a wrong pick identifiable', () => {
    render(Question, {
      question: open(),
      reveal: REVEAL,
      yourValue: 3,
      result: { value: 3, correct: false, credit: 0, points: 0 },
      onAnswer: () => {},
    })
    const buttons = screen.getAllByRole('button')
    expect(buttons[1]!.classList.contains('correct')).toBe(true)
    expect(buttons[3]!.classList.contains('wrong')).toBe(true)
    expect(buttons[3]!.textContent).toContain('you')
    // Position is identity: the ladder is sapphire, emerald, ruby, red topaz, revealed or not.
    const gems = ['sapphire', 'emerald', 'ruby', 'red-topaz']
    buttons.forEach((b, i) => expect(b.classList.contains(gems[i]!)).toBe(true))
    expect(screen.getByText(/^Grand Exchange price, rounded, as of /)).toBeTruthy()
  })

  it('draws the stem as nothing when the subject has no name', () => {
    const timing = {
      answerableAt: '2026-09-21T20:00:00Z',
      endsAt: '2026-09-21T20:00:20Z',
      steps: null,
      now: readable(0),
    }
    const { container } = render(AssetStem, { data: { subject: {} }, revealed: false, timing })
    expect(container.textContent?.trim()).toBe('')
  })
})
