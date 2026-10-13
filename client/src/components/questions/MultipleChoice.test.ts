/**
 * `multiple_choice` on screen, as the host's own question: the prompt from `TextStem`,
 * then the written answers, then — after close — which one it was and why.
 */

import { fireEvent, render, screen } from '@testing-library/svelte'
import { describe, expect, it, vi } from 'vitest'

import type { OpenQuestion } from '../../lib/protocol'
import { GEMS } from './GemButton.svelte'
import { viewFor } from './index'
import Question from './Question.svelte'
import ExamineStem from './stems/ExamineStem.svelte'
import QuoteStem from './stems/QuoteStem.svelte'
import TextStem from './stems/TextStem.svelte'
import MultipleChoice from './types/MultipleChoice.svelte'

const VIEW = {
  prompt: 'Which boss drops the Tanzanite fang?',
  options: ['Zulrah', 'Vorkath', 'Jad'],
}

const REVEAL = { ...VIEW, answer_index: 0, explanation: 'One of Zulrah’s uniques.' }

function open(
  youCanAnswer = true,
  view: Record<string, unknown> = VIEW,
  mode = 'custom',
): OpenQuestion {
  return {
    question_id: 'q1',
    index: 3,
    total: 10,
    type: 'multiple_choice',
    mode,
    // The round it interrupts. `RandomEvent` draws the NPC around this; the question is this.
    segment: { mode: 'more_less', index: 1, total: 3, start: 2, count: 5 },
    view,
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

  it('draws six options, the most there are, on six different gems', () => {
    const six = { ...VIEW, options: ['Zulrah', 'Vorkath', 'Jad', 'Kraken', 'Hydra', 'Sire'] }
    render(Question, { question: open(true, six), yourValue: null, onAnswer: () => {} })
    const gems = screen
      .getAllByRole('button')
      .map((b) => GEMS.find((gem) => b.classList.contains(gem)))
    expect(gems).toEqual([...GEMS])
    expect(new Set(gems).size).toBe(6)
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
    // The waiting state: our pick held, and only ours, as pressed.
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

describe('multiple_choice in a quote round', () => {
  const QUOTE = { prompt: 'Who said this?', quote: 'What am I to do?', options: ['Cook', 'Hans'] }

  it('is drawn by the quote stem for both quote rounds', () => {
    for (const mode of ['who_said_that', 'know_your_content_creator']) {
      expect(viewFor('multiple_choice', mode)).toEqual({ stem: QuoteStem, view: MultipleChoice })
    }
  })

  it('sets the quote apart below the prompt, above the options', () => {
    render(Question, {
      question: open(true, QUOTE, 'who_said_that'),
      yourValue: null,
      onAnswer: () => {},
    })
    const quote = screen.getByText('What am I to do?')
    expect(quote.tagName).toBe('BLOCKQUOTE')
    expect(screen.getByText('Who said this?').tagName).toBe('FIGCAPTION')
    expect(quote.compareDocumentPosition(screen.getByText('Cook'))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    )
  })

  it('asks a question without a quote as plain text', () => {
    const { quote: _, ...trivia } = QUOTE
    render(Question, {
      question: open(true, trivia, 'know_your_content_creator'),
      yourValue: null,
      onAnswer: () => {},
    })
    expect(screen.getByText('Who said this?').tagName).toBe('P')
    expect(document.querySelector('blockquote')).toBeNull()
  })
})

describe('multiple_choice in Guess the Examine', () => {
  const EXAMINE = { prompt: 'Future web developers.', options: ['Spider eggs', 'Web', 'Giant spider', 'Spider carcass'] }

  it('is drawn by the examine stem', () => {
    expect(viewFor('multiple_choice', 'guess_examine')).toEqual({ stem: ExamineStem, view: MultipleChoice })
  })

  it('sets the examine line as a quotation above the options', () => {
    render(Question, { question: open(true, EXAMINE, 'guess_examine'), yourValue: null, onAnswer: () => {} })
    const line = screen.getByText('Future web developers.')
    expect(line.tagName).toBe('BLOCKQUOTE')
    expect(line.compareDocumentPosition(screen.getByRole('button', { name: /Spider eggs/ }))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    )
    expect(answers()).toHaveLength(4)
  })
})
