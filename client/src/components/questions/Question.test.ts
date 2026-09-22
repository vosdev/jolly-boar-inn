/**
 * `viewFor` and `Question.svelte`: which pair draws a question, and in what order.
 *
 * `more_less` draws itself, and the one shipped mode with a stem (`price_is_right`) has
 * tests of its own in `PriceIsRight.test.ts`, so the composed case here plays a made-up
 * mode, `stemmed`, putting the text stem on the `more_less` view. It is added to the
 * registry through the module mock below rather than to `lib/modes.ts`, where it would
 * be a mode the create form offers.
 */

import { render, screen } from '@testing-library/svelte'
import { describe, expect, it, vi } from 'vitest'

import type { OpenQuestion } from '../../lib/protocol'
import { viewFor } from './index'
import Question from './Question.svelte'
import TextStem from './stems/TextStem.svelte'
import MoreLess from './types/MoreLess.svelte'

vi.mock('../../lib/modes', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../lib/modes')>()
  return {
    ...real,
    MODES: {
      ...real.MODES,
      stemmed: { ...real.MODES.more_less, id: 'stemmed', stem: 'text' },
    },
  }
})

const VIEW = {
  metric: 'ge_price',
  direction: 'more',
  options: [{ subject: { name: 'Abyssal whip' } }, { subject: { name: 'Dragon bones' } }],
  as_of: '2026-09-01',
}

const REVEAL = {
  ...VIEW,
  options: [
    { subject: { name: 'Abyssal whip' }, value: 1_500_000 },
    { subject: { name: 'Dragon bones' }, value: 2_000 },
  ],
  answer_index: 0,
}

function open(type: string, mode: string, view: Record<string, unknown> = VIEW): OpenQuestion {
  return {
    question_id: 'q1',
    index: 0,
    total: 10,
    type,
    mode,
    segment: { mode, index: 0, total: 1, start: 0, count: 10 },
    view,
    opened_at: '2026-09-21T20:00:00Z',
    ends_at: '2026-09-21T20:00:10Z',
    you_can_answer: true,
  }
}

const onAnswer = () => {}

/**
 * What a browser draws from some markup: Svelte's `<!---->` block anchors render as
 * nothing, and neither does the whitespace they leave either side of a block element.
 */
function drawn(container: HTMLElement): string {
  return container.innerHTML.replaceAll('<!---->', '').replace(/\s+/g, ' ').trim()
}

describe('viewFor', () => {
  it('takes the view from the type and the stem from the mode', () => {
    expect(viewFor('more_less', 'stemmed')).toEqual({ stem: TextStem, view: MoreLess })
  })

  it('gives more_less its view and no stem', () => {
    expect(viewFor('more_less', 'more_less')).toEqual({ stem: null, view: MoreLess })
  })

  it('leaves out whichever half this build does not know', () => {
    expect(viewFor('more_less', 'from_a_newer_server')).toEqual({ stem: null, view: MoreLess })
    expect(viewFor('from_a_newer_server', 'stemmed')).toEqual({ stem: TextStem, view: null })
  })
})

describe('Question', () => {
  it('draws a mode with no stem as its view alone, markup and all', () => {
    const composed = render(Question, {
      question: open('more_less', 'more_less'),
      yourValue: null,
      onAnswer,
    })
    const alone = render(MoreLess, {
      data: VIEW,
      revealed: false,
      yourValue: null,
      canAnswer: true,
      onAnswer,
    })
    expect(drawn(composed.container)).not.toBe('')
    expect(drawn(composed.container)).toBe(drawn(alone.container))
  })

  it('draws the reveal from the reveal frame, not the open view', () => {
    render(Question, {
      question: open('more_less', 'more_less'),
      reveal: REVEAL,
      yourValue: 0,
      result: { value: 0, correct: true, credit: 1, points: 900 },
      onAnswer,
    })
    expect(screen.getByText('1,500,000 gp')).toBeTruthy()
    expect(screen.getAllByRole('button')[0].classList.contains('correct')).toBe(true)
  })

  it('draws the fallback for a type with no view, and no stem above it', () => {
    const question = open('from_a_newer_server', 'stemmed', { prompt: 'Who said that?' })
    render(Question, { question, yourValue: null, onAnswer })
    expect(screen.getByText('from_a_newer_server').tagName).toBe('CODE')
    expect(screen.getByText('Sit this one out — the game carries on.')).toBeTruthy()
    expect(screen.queryByText('Who said that?')).toBeNull()
  })

  it('draws the closed fallback for a revealed type with no view', () => {
    render(Question, {
      question: open('from_a_newer_server', 'more_less'),
      reveal: {},
      yourValue: null,
      onAnswer,
    })
    expect(screen.getByText('That question is closed.')).toBeTruthy()
  })

  it('puts the stem above the view', () => {
    const view = { ...VIEW, prompt: 'Which of these would a merchant rather hold?' }
    render(Question, { question: open('more_less', 'stemmed', view), yourValue: null, onAnswer })
    const stem = screen.getByText('Which of these would a merchant rather hold?')
    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(2)
    for (const button of buttons) {
      expect(stem.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
  })
})
