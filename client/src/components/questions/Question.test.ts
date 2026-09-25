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
import type { Component } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { serverNow } from '../../lib/clock'
import type { OpenQuestion } from '../../lib/protocol'
import { clearVocabCache } from '../../lib/vocab'
import { STEMS, TYPE_VIEWS, viewFor } from './index'
import type { StemProps, StemTiming, TypeViewProps } from './props'
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

  describe('a view that throws', () => {
    afterEach(() => {
      delete TYPE_VIEWS.throws
      vi.restoreAllMocks()
    })

    it('is replaced by the fallback, stem and all', () => {
      const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
      TYPE_VIEWS.throws = (() => {
        throw new Error('a payload this build misreads')
      }) as unknown as Component<TypeViewProps>
      const view = { prompt: 'Which of these would a merchant rather hold?' }
      const { container } = render(Question, {
        question: open('throws', 'stemmed', view),
        yourValue: null,
        onAnswer,
      })
      expect(container.textContent?.trim()).toBe(
        "This question can't be shown in this version. Refresh to update.",
      )
      expect(logged).toHaveBeenCalled()
    })
  })
})

const PRICES = { subject: { name: 'Abyssal whip' }, options: [1, 2, 3, 4], as_of: '2026-09-20' }

/** One question of every type this build draws, as its mode sends it open and closed. */
const EVERY_TYPE: { type: string; mode: string; view: object; reveal: object }[] = [
  { type: 'more_less', mode: 'more_less', view: VIEW, reveal: REVEAL },
  {
    type: 'price_is_right',
    mode: 'price_is_right',
    view: PRICES,
    reveal: { ...PRICES, value: 2, answer_index: 1 },
  },
  {
    type: 'multiple_choice',
    mode: 'custom',
    view: { prompt: 'Which?', options: ['Zulrah', 'Vorkath'] },
    reveal: { prompt: 'Which?', options: ['Zulrah', 'Vorkath'], answer_index: 0 },
  },
  {
    type: 'closest_number',
    mode: 'custom',
    view: { prompt: 'How many?' },
    reveal: { prompt: 'How many?', answer: 100 },
  },
  {
    type: 'free_text',
    mode: 'custom',
    view: { prompt: 'Who?' },
    reveal: { prompt: 'Who?', accepted: ['Zezima'] },
  },
  {
    type: 'pick_from_list',
    mode: 'guess_examine',
    view: { prompt: 'A very powerful onyx amulet.', vocab: 'items' },
    reveal: { prompt: 'A very powerful onyx amulet.', vocab: 'items', answer_id: 6585 },
  },
]

/** The types whose `reveal` carries the author's `explanation` (`questions/types/*.py`). */
const EXPLAINED = ['multiple_choice', 'closest_number', 'free_text', 'pick_from_list']

const entries = [{ id: 6585, name: 'Amulet of fury' }]
const NOTE = 'This one is not scored for you — sit back and watch.'
const WHY = 'Because the wiki says so.'

describe('what every type says the same way', () => {
  beforeEach(() => {
    clearVocabCache()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ vocab: 'items', version: 'v1', entries }))),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('covers every type this build draws', () => {
    expect(EVERY_TYPE.map((each) => each.type).sort()).toEqual(Object.keys(TYPE_VIEWS).sort())
  })

  it.each(EVERY_TYPE)('tells somebody who cannot answer $type, once', (each) => {
    const question = { ...open(each.type, each.mode, { ...each.view }), you_can_answer: false }
    const shut = render(Question, { question, yourValue: null, onAnswer })
    expect(screen.getAllByText(NOTE)).toHaveLength(1)
    shut.unmount()
    render(Question, { question, reveal: { ...each.reveal }, yourValue: null, onAnswer })
    expect(screen.queryByText(NOTE)).toBeNull()
  })

  it.each(EVERY_TYPE)('says nothing of the kind to a player of $type', (each) => {
    const question = open(each.type, each.mode, { ...each.view })
    render(Question, { question, yourValue: null, onAnswer })
    expect(screen.queryByText(NOTE)).toBeNull()
  })

  it.each(EXPLAINED)('shows the explanation of a revealed %s once, under the view', (type) => {
    const each = EVERY_TYPE.find((one) => one.type === type)!
    const { container } = render(Question, {
      question: open(each.type, each.mode, { ...each.view }),
      reveal: { ...each.reveal, explanation: WHY },
      yourValue: null,
      onAnswer,
    })
    expect(screen.getAllByText(WHY)).toHaveLength(1)
    expect(container.lastElementChild?.textContent).toBe(WHY)
  })

  it('keeps the explanation back while the question is open', () => {
    render(Question, {
      question: open('multiple_choice', 'custom', {
        prompt: 'Which?',
        options: ['A', 'B'],
        explanation: WHY,
      }),
      yourValue: null,
      onAnswer,
    })
    expect(screen.queryByText(WHY)).toBeNull()
  })
})

describe('the stem’s schedule', () => {
  const real = STEMS.text
  let seen: StemTiming | null = null

  beforeEach(() => {
    seen = null
    STEMS.text = ((_anchor: unknown, props: StemProps) => {
      seen = props.timing
    }) as unknown as Component<StemProps>
  })

  afterEach(() => {
    STEMS.text = real
  })

  it('is the question’s, on the server clock', () => {
    const question = {
      ...open('more_less', 'stemmed', { ...VIEW, steps: 8 }),
      answerable_at: '2026-09-21T20:00:02Z',
    }
    render(Question, { question, yourValue: null, onAnswer })
    expect(seen).toEqual({
      answerableAt: '2026-09-21T20:00:02Z',
      endsAt: '2026-09-21T20:00:10Z',
      steps: 8,
      now: serverNow,
    })
  })

  it('opens at `opened_at` with no hold sent, and has no steps with none in the view', () => {
    render(Question, { question: open('more_less', 'stemmed'), yourValue: null, onAnswer })
    expect(seen).toMatchObject({ answerableAt: '2026-09-21T20:00:00Z', steps: null })
  })
})
