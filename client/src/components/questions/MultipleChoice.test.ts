/**
 * `multiple_choice` on screen, as the host's own question: the prompt from `TextStem`,
 * then the written answers, then — after close — which one it was and why.
 */

import { fireEvent, render, screen } from '@testing-library/svelte'
import { describe, expect, it, vi } from 'vitest'

import type { OpenQuestion } from '../../lib/protocol'
import { viewFor } from './index'
import Question from './Question.svelte'
import TextStem from './stems/TextStem.svelte'
import MultipleChoice from './types/MultipleChoice.svelte'

const VIEW = {
  prompt: 'Which boss drops the Tanzanite fang?',
  options: ['Zulrah', 'Vorkath', 'Jad'],
}

const REVEAL = { ...VIEW, answer_index: 0, explanation: 'One of Zulrah’s uniques.' }

function open(youCanAnswer = true): OpenQuestion {
  return {
    question_id: 'q1',
    index: 3,
    total: 10,
    type: 'multiple_choice',
    mode: 'custom',
    // The round it interrupts. `RandomEvent` draws the NPC around this; the question is this.
    segment: { mode: 'more_less', index: 1, total: 3, start: 2, count: 5 },
    view: VIEW,
    opened_at: '2026-09-21T20:00:00Z',
    ends_at: '2026-09-21T20:00:20Z',
    you_can_answer: youCanAnswer,
  }
}

const answers = () => screen.getAllByRole('button').map((b) => b.textContent?.trim())

describe('multiple_choice', () => {
  it('is drawn by the text stem over its own view for a host’s question', () => {
    expect(viewFor('multiple_choice', 'custom')).toEqual({ stem: TextStem, view: MultipleChoice })
  })

  it('asks the prompt once, above every option in the order sent', () => {
    render(Question, { question: open(), yourValue: null, onAnswer: () => {} })
    expect(screen.getAllByText(VIEW.prompt)).toHaveLength(1)
    expect(answers()).toEqual(['Zulrah', 'Vorkath', 'Jad'])
    expect(screen.queryByText('correct')).toBeNull()
  })

  it('answers with the index of the option picked', async () => {
    const onAnswer = vi.fn()
    render(Question, { question: open(), yourValue: null, onAnswer })
    await fireEvent.click(screen.getByText('Jad'))
    expect(onAnswer).toHaveBeenCalledWith(2)
  })

  it('holds the buttons once answered, and for the author who cannot answer', () => {
    const answered = render(Question, { question: open(), yourValue: 1, onAnswer: () => {} })
    const disabled = () =>
      screen.getAllByRole('button').every((b) => (b as HTMLButtonElement).disabled)
    expect(disabled()).toBe(true)
    // D8's waiting state: our pick held, and only ours, as pressed.
    const pressed = screen.getAllByRole('button').map((b) => b.getAttribute('aria-pressed'))
    expect(pressed).toEqual(['false', 'true', 'false'])
    expect(screen.getByText('you')).toBeTruthy()
    answered.unmount()
    render(Question, { question: open(false), yourValue: null, onAnswer: () => {} })
    expect(disabled()).toBe(true)
    expect(screen.getByText('This one is not scored for you — sit back and watch.')).toBeTruthy()
  })

  it('lights the right answer on the reveal, fades the rest, keeps our wrong pick, says why', () => {
    render(Question, {
      question: open(),
      reveal: REVEAL,
      yourValue: 1,
      result: { value: 1, correct: false, credit: 0, points: 0 },
      onAnswer: () => {},
    })
    const buttons = screen.getAllByRole('button')
    expect(buttons.map((b) => b.classList.contains('correct'))).toEqual([true, false, false])
    expect(buttons[1]!.classList.contains('wrong')).toBe(true)
    expect(buttons[2]!.classList.contains('faded')).toBe(true)
    // The verdict is the points slot's (Room), not the view's.
    expect(screen.queryByText(/no points/)).toBeNull()
    expect(screen.getByText('One of Zulrah’s uniques.')).toBeTruthy()
  })

  it('says nothing about why when the author gave no explanation', () => {
    render(Question, {
      question: open(),
      reveal: { ...VIEW, answer_index: 0 },
      yourValue: 0,
      result: { value: 0, correct: true, credit: 1, points: 800 },
      onAnswer: () => {},
    })
    expect(screen.getAllByRole('button')[0]!.classList.contains('correct')).toBe(true)
    expect(document.querySelector('.explanation')).toBeNull()
  })
})
