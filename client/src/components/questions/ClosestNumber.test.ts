/**
 * `closest_number` on screen: a box that takes a number the way the game writes one, and a
 * reveal that says how far off you were.
 */

import { fireEvent, render, screen } from '@testing-library/svelte'
import { describe, expect, it, vi } from 'vitest'

import type { OpenQuestion } from '../../lib/protocol'
import { viewFor } from './index'
import Question from './Question.svelte'
import TextStem from './stems/TextStem.svelte'
import ClosestNumber from './types/ClosestNumber.svelte'

const VIEW = { prompt: 'How many hours did the Infernal cape take?', unit: 'hours' }
const REVEAL = { ...VIEW, answer: 100, explanation: 'Most of them at Zuk.' }

function open(youCanAnswer = true, view: Record<string, unknown> = VIEW): OpenQuestion {
  return {
    question_id: 'q1',
    index: 3,
    total: 10,
    type: 'closest_number',
    mode: 'custom',
    segment: { mode: 'more_less', index: 1, total: 3, start: 2, count: 5 },
    view,
    opened_at: '2026-09-21T20:00:00Z',
    ends_at: '2026-09-21T20:00:20Z',
    you_can_answer: youCanAnswer,
    picture: null,
    random_event: null,
    answerable_at: '2026-09-21T20:00:00Z',
    answered: 0,
    of: 0,
    waiting: [],
    item_used: false,
    removed: [],
  }
}

const box = () => screen.getByRole('textbox') as HTMLInputElement
const submit = () => screen.getByRole('button', { name: 'Submit' }) as HTMLButtonElement

describe('closest_number', () => {
  it('is drawn by the text stem over its own view', () => {
    expect(viewFor('closest_number', 'custom')).toEqual({ stem: TextStem, view: ClosestNumber })
  })

  it('asks for a guess in the unit given, and says only the exact answer scores', () => {
    render(Question, { question: open(), yourValue: null, onAnswer: () => {} })
    expect(screen.getByText(VIEW.prompt)).toBeTruthy()
    expect(screen.getByLabelText('Your guess (hours)')).toBe(box())
    expect(screen.getByText('Exact answers only.')).toBeTruthy()
  })

  it('says how far off still scores, in the unit given', () => {
    render(Question, {
      question: open(true, { ...VIEW, within: 1500 }),
      yourValue: null,
      onAnswer: () => {},
    })
    expect(screen.getByText('Within 1,500 hours scores.')).toBeTruthy()
    expect(screen.queryByText('Exact answers only.')).toBeNull()
  })

  it('keeps Submit off until the box holds a number', async () => {
    render(Question, { question: open(), yourValue: null, onAnswer: () => {} })
    expect(submit().disabled).toBe(true)
    await fireEvent.input(box(), { target: { value: 'lots' } })
    expect(submit().disabled).toBe(true)
    expect(screen.getByText('That is not a number. 12,500 and 1.6m both are.')).toBeTruthy()
    await fireEvent.input(box(), { target: { value: '120' } })
    expect(submit().disabled).toBe(false)
  })

  it('sends the number, read the way the game writes it', async () => {
    const onAnswer = vi.fn()
    render(Question, { question: open(), yourValue: null, onAnswer })
    await fireEvent.input(box(), { target: { value: '1.2k' } })
    await fireEvent.submit(box().form!)
    expect(onAnswer).toHaveBeenCalledWith(1200)
  })

  it('shows the guess once it is in, and no box to change it', () => {
    render(Question, { question: open(), yourValue: 1200, onAnswer: () => {} })
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.getByText('1,200 hours')).toBeTruthy()
  })

  it('lets the author watch rather than guess', () => {
    render(Question, { question: open(false), yourValue: null, onAnswer: () => {} })
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.getByText('This one is not scored for you — sit back and watch.')).toBeTruthy()
  })

  it('reveals the answer and how far off the guess was, not what it paid', () => {
    render(Question, {
      question: open(),
      reveal: REVEAL,
      yourValue: 99,
      result: {
        value: 99,
        correct: false,
        credit: 0.75,
        points: 750,
        item_points: 0,
        item: null,
        by_book: false,
      },
      onAnswer: () => {},
    })
    expect(screen.getByText('100 hours')).toBeTruthy()
    expect(screen.getByText('99 hours')).toBeTruthy()
    expect(document.querySelector('.picked')?.textContent).toMatch(/99 hours\s*, off by 1 hours/)
    // What it paid is the points slot's to say, not the view's.
    expect(screen.queryByText(/750/)).toBeNull()
    expect(screen.getByText('Most of them at Zuk.')).toBeTruthy()
  })

  it('calls an exact guess spot on, and shows no guess when there was none', () => {
    const exact = render(Question, {
      question: open(),
      reveal: REVEAL,
      yourValue: 100,
      result: {
        value: 100,
        correct: true,
        credit: 1,
        points: 1000,
        item_points: 0,
        item: null,
        by_book: false,
      },
      onAnswer: () => {},
    })
    expect(document.querySelector('.picked')?.textContent).toMatch(/, spot on/)
    exact.unmount()
    render(Question, { question: open(), reveal: REVEAL, yourValue: null, onAnswer: () => {} })
    expect(document.querySelector('.picked')).toBeNull()
    expect(screen.getByText('100 hours')).toBeTruthy()
  })
})
