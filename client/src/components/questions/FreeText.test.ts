/**
 * `free_text` on screen: a box, Submit, and on the reveal every spelling that counted.
 */

import { fireEvent, render, screen } from '@testing-library/svelte'
import { describe, expect, it, vi } from 'vitest'

import type { OpenQuestion } from '../../lib/protocol'
import { viewFor } from './index'
import Question from './Question.svelte'
import TextStem from './stems/TextStem.svelte'
import FreeText from './types/FreeText.svelte'

const VIEW = { prompt: 'Who has the clan’s highest Zulrah kill count?' }
const REVEAL = { ...VIEW, accepted: ['Zezima', 'Zezima the Great'] }

function open(youCanAnswer = true): OpenQuestion {
  return {
    question_id: 'q1',
    index: 3,
    total: 10,
    type: 'free_text',
    mode: 'custom',
    segment: { mode: 'more_less', index: 1, total: 3, start: 2, count: 5 },
    view: VIEW,
    opened_at: '2026-09-21T20:00:00Z',
    ends_at: '2026-09-21T20:00:20Z',
    you_can_answer: youCanAnswer,
    picture: null,
    random_event: null,
    answerable_at: '2026-09-21T20:00:00Z',
    answered: 0,
    of: 0,
    waiting: [],
  }
}

const box = () => screen.getByRole('textbox') as HTMLInputElement
const submit = () => screen.getByRole('button', { name: 'Submit' }) as HTMLButtonElement

describe('free_text', () => {
  it('is drawn by the text stem over its own view', () => {
    expect(viewFor('free_text', 'custom')).toEqual({ stem: TextStem, view: FreeText })
  })

  it('asks the prompt over a box that takes no more than the server will', () => {
    render(Question, { question: open(), yourValue: null, onAnswer: () => {} })
    expect(screen.getByText(VIEW.prompt)).toBeTruthy()
    expect(box().maxLength).toBe(80)
    expect(screen.getByLabelText(/capitals and punctuation do not matter/)).toBe(box())
  })

  it('sends what was typed, trimmed, and nothing while the box is blank', async () => {
    const onAnswer = vi.fn()
    render(Question, { question: open(), yourValue: null, onAnswer })
    await fireEvent.input(box(), { target: { value: '   ' } })
    expect(submit().disabled).toBe(true)
    await fireEvent.submit(box().form!)
    expect(onAnswer).not.toHaveBeenCalled()
    await fireEvent.input(box(), { target: { value: '  zezima ' } })
    await fireEvent.submit(box().form!)
    expect(onAnswer).toHaveBeenCalledWith('zezima')
  })

  it('shows the answer once it is in, and no box to change it', () => {
    render(Question, { question: open(), yourValue: 'zezima', onAnswer: () => {} })
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.getByText('zezima')).toBeTruthy()
  })

  it('lets the author watch rather than answer', () => {
    render(Question, { question: open(false), yourValue: null, onAnswer: () => {} })
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.getByText('This one is not scored for you — sit back and watch.')).toBeTruthy()
  })

  it('reveals the answer and the other spellings that counted beside ours', () => {
    render(Question, {
      question: open(),
      reveal: REVEAL,
      yourValue: 'Zezma',
      result: { value: 'Zezma', correct: true, credit: 1, points: 900 },
      onAnswer: () => {},
    })
    expect(screen.getByText('Zezima')).toBeTruthy()
    expect(screen.getByText('Also accepted: Zezima the Great')).toBeTruthy()
    // Ours recedes beside it; whether it counted is the points slot's to say.
    expect(screen.getByText('Zezma').closest('p')?.classList.contains('picked')).toBe(true)
    expect(screen.queryByText(/900/)).toBeNull()
  })

  it('names the subject on the reveal the way the list does, and the other spellings', () => {
    render(Question, {
      question: open(),
      reveal: {
        prompt: 'Whose pet is the Jal-nib-rek?',
        accepted: ['zuk', 'TzKal-Zuk', 'tzkal zuk'],
        subject: { name: 'TzKal-Zuk', asset: 'npc:7706' },
      },
      yourValue: 'zuk',
      onAnswer: () => {},
    })
    expect(screen.getByText('TzKal-Zuk').parentElement?.textContent).toBe('It was TzKal-Zuk.')
    expect(screen.getByText('Also accepted: zuk, tzkal zuk')).toBeTruthy()
  })
})
