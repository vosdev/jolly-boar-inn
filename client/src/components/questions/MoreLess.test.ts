/**
 * `more_less` on screen: two plain buttons that answer with their position, and hold once
 * an answer is in or when it is not ours to answer.
 */

import { fireEvent, render, screen } from '@testing-library/svelte'
import { describe, expect, it, vi } from 'vitest'

import type { OpenQuestion } from '../../lib/protocol'
import Question from './Question.svelte'

const VIEW = {
  metric: 'ge_price',
  direction: 'more',
  options: [{ subject: { name: 'Abyssal whip' } }, { subject: { name: 'Dragon bones' } }],
  as_of: '2026-09-01',
}

function open(patch: Partial<OpenQuestion> = {}): OpenQuestion {
  return {
    question_id: 'q1',
    index: 0,
    total: 10,
    type: 'more_less',
    mode: 'more_less',
    segment: { mode: 'more_less', index: 0, total: 1, start: 0, count: 10 },
    view: VIEW,
    opened_at: '2026-09-21T20:00:00Z',
    ends_at: '2026-09-21T20:00:10Z',
    you_can_answer: true,
    picture: null,
    random_event: null,
    answered: 0,
    of: 0,
    waiting: [],
    answerable_at: '2026-09-21T20:00:00Z',
    ...patch,
  }
}

const buttons = () => screen.getAllByRole('button') as HTMLButtonElement[]

describe('more_less', () => {
  it('answers with the index of the item picked', async () => {
    const onAnswer = vi.fn()
    render(Question, { question: open(), yourValue: null, onAnswer })
    await fireEvent.click(screen.getByText('Dragon bones'))
    expect(onAnswer).toHaveBeenCalledWith(1)
  })

  it('holds both buttons once answered, with ours pressed', () => {
    render(Question, { question: open(), yourValue: 0, onAnswer: () => {} })
    expect(buttons().every((b) => b.disabled)).toBe(true)
    expect(buttons().map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false'])
  })

  it('gives someone who cannot answer no button to press', () => {
    render(Question, {
      question: open({ you_can_answer: false }),
      yourValue: null,
      onAnswer: () => {},
    })
    expect(buttons().every((b) => b.disabled)).toBe(true)
    expect(buttons().every((b) => b.getAttribute('aria-pressed') === 'false')).toBe(true)
    expect(screen.getByText('This one is not scored for you — sit back and watch.')).toBeTruthy()
  })

  it('draws both buttons when an item is compared with itself', async () => {
    const whip = { subject: { name: 'Abyssal whip', asset: 'item:4151' } }
    const onAnswer = vi.fn()
    render(Question, {
      question: open({ view: { ...VIEW, metric: 'high_alch', options: [whip, whip] } }),
      yourValue: null,
      onAnswer,
    })
    expect(screen.getAllByText('Abyssal whip')).toHaveLength(2)
    await fireEvent.click(buttons()[1]!)
    expect(onAnswer).toHaveBeenCalledWith(1)
  })
})

describe('more_less’s question', () => {
  const asked = () => document.querySelector('.ask')?.textContent?.replace(/\s+/g, ' ').trim()

  it('names the metric’s source, with the direction set apart', () => {
    render(Question, { question: open(), yourValue: null, onAnswer: () => {} })
    expect(asked()).toBe('Which costs more on the Grand Exchange?')
    expect(screen.getByText('more').classList.contains('word')).toBe(true)
  })

  it('says what high alchemy is worth, and asks for less', () => {
    const view = { ...VIEW, metric: 'high_alch', direction: 'less' }
    render(Question, { question: open({ view }), yourValue: null, onAnswer: () => {} })
    expect(asked()).toBe('Which is worth less through High Alchemy?')
  })

  it('still asks the bare question for a metric this build does not know', () => {
    const view = { ...VIEW, metric: 'from_a_newer_schema' }
    render(Question, { question: open({ view }), yourValue: null, onAnswer: () => {} })
    expect(asked()).toBe('Which costs more?')
  })

  it('says on each button how many picked it, through the question, on the reveal', () => {
    const picked = (value: number) => ({
      value,
      correct: value === 0,
      credit: 0,
      points: 0,
      item_points: 0,
      item: null,
    })
    const { container } = render(Question, {
      question: open(),
      reveal: { ...VIEW, answer_index: 0 },
      results: { a: picked(0), b: picked(1), c: picked(1) },
      yourValue: null,
      onAnswer: () => {},
    })
    expect([...container.querySelectorAll('.votes')].map((v) => v.textContent)).toEqual(['1', '2'])
  })

  it('leaves the date of its prices to the splash and the footer', () => {
    render(Question, {
      question: open(),
      reveal: { ...VIEW, answer_index: 0 },
      yourValue: null,
      onAnswer: () => {},
    })
    expect(document.body.textContent).not.toContain('as of')
  })
})
