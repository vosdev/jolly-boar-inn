/**
 * `viewFor` and `Question.svelte`: which pair draws a question, and in what order.
 *
 * Every shipped mode's stem has tests of its own beside its view, so the composed case
 * here plays a made-up mode, `stemmed`, putting the text stem on the `more_less` view. It is added to the
 * registry through the module mock below rather than to `lib/modes.ts`, where it would
 * be a mode the create form offers.
 */

import { cleanup, render, screen, waitFor } from '@testing-library/svelte'
import { createRawSnippet, type Component } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import ribbon from '../../assets/stage/ribbon.svg'
import bountySkull2 from '../../assets/sprites/bounty-skull-2.svg'
import bountySkull5 from '../../assets/sprites/bounty-skull-5.svg'
import { serverNow } from '../../lib/clock'
import type { OpenQuestion, PlayerResult } from '../../lib/protocol'
import { MODES } from '../../lib/modes'
import { answerCount, players } from '../../lib/stores'
import { clearVocabCache } from '../../lib/vocab'
import QuestionStage from '../QuestionStage.svelte'
import { STEMS, TYPE_VIEWS, viewFor } from './index'
import type { StemProps, StemTiming, TypeViewProps } from './props'
import Question from './Question.svelte'
import MoreLessStem from './stems/MoreLessStem.svelte'
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
    picture: null,
    random_event: null,
    answerable_at: '2026-09-21T20:00:00Z',
    answered: 0,
    of: 0,
    waiting: [],
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

  it('gives more_less its own stem, which asks the question on the scroll', () => {
    expect(viewFor('more_less', 'more_less')).toEqual({ stem: MoreLessStem, view: MoreLess })
  })

  it('leaves out whichever half this build does not know', () => {
    expect(viewFor('more_less', 'from_a_newer_server')).toEqual({ stem: null, view: MoreLess })
    expect(viewFor('from_a_newer_server', 'stemmed')).toEqual({ stem: TextStem, view: null })
  })
})

describe('Question', () => {
  it('draws a mode with no stem as its view alone, markup and all', () => {
    const composed = render(Question, {
      question: open('more_less', 'from_a_newer_server'),
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
    expect(screen.getAllByRole('button')[0]!.classList.contains('correct')).toBe(true)
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
    type: 'number_slider',
    mode: 'custom',
    view: { prompt: 'How many?', min: 1, max: 99, scale: 'linear' },
    reveal: { prompt: 'How many?', min: 1, max: 99, scale: 'linear', answer: 85 },
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
  {
    type: 'pick_all_that_apply',
    mode: 'custom',
    view: { prompt: 'Which?', options: ['Sarachnis', 'Venenatis', 'Scorpia'] },
    reveal: {
      prompt: 'Which?',
      options: ['Sarachnis', 'Venenatis', 'Scorpia'],
      answer_indices: [0, 1],
    },
  },
  {
    type: 'ordering',
    mode: 'custom',
    view: {
      prompt: 'Which?',
      ends: ['Weakest', 'Strongest'],
      entries: [{ text: 'Iron' }, { text: 'Bronze' }, { text: 'Steel' }],
    },
    reveal: {
      prompt: 'Which?',
      ends: ['Weakest', 'Strongest'],
      entries: [
        { text: 'Iron', rank: 2 },
        { text: 'Bronze', rank: 1 },
        { text: 'Steel', rank: 3 },
      ],
      answer: [1, 0, 2],
    },
  },
  {
    type: 'matching',
    mode: 'custom',
    view: {
      prompt: 'Which?',
      fields: [{ text: 'Zulrah' }, { text: 'Vorkath' }, { text: 'Kraken' }],
      options: [{ text: 'Ungael' }, { text: 'Kraken Cove' }, { text: 'Zul-Andra' }],
    },
    reveal: {
      prompt: 'Which?',
      fields: [{ text: 'Zulrah' }, { text: 'Vorkath' }, { text: 'Kraken' }],
      options: [{ text: 'Ungael' }, { text: 'Kraken Cove' }, { text: 'Zul-Andra' }],
      answer: [2, 0, 1],
    },
  },
]

/** The types whose `reveal` carries the author's `explanation` (`questions/types/*.py`). */
const EXPLAINED = [
  'multiple_choice',
  'closest_number',
  'number_slider',
  'free_text',
  'pick_from_list',
  'pick_all_that_apply',
  'ordering',
  'matching',
]

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

describe('every type on the stage', () => {
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

  const paper = () => document.querySelector('.paper') as HTMLElement
  const under = () => document.querySelector('.under') as HTMLElement
  const pressable = 'button, input, [role="combobox"]'

  for (const { type, mode, view, reveal } of EVERY_TYPE) {
    it(`puts ${type}'s stem on the scroll and its answers under the line`, async () => {
      const question = { ...open(type, mode), view: view as Record<string, unknown> }
      const { unmount } = render(QuestionStage, { question, yourValue: null, onAnswer })
      await waitFor(() => expect(under().querySelector('button, input')).toBeTruthy())
      expect(paper().textContent?.trim()).not.toBe('')
      expect(paper().querySelector(pressable)).toBeNull()
      unmount()

      render(QuestionStage, {
        question,
        reveal: reveal as Record<string, unknown>,
        yourValue: null,
        onAnswer,
      })
      expect(paper().textContent?.trim()).not.toBe('')
      expect(paper().querySelector(pressable)).toBeNull()
      expect(paper().querySelector('.slot')?.textContent).toContain('No answer · +0')
    })
  }

  it('holds the line the points go on, so the answers do not move for them', () => {
    render(QuestionStage, { question: open('more_less', 'more_less'), yourValue: null, onAnswer })
    const said = paper().querySelector('.said')
    expect(said).toBeTruthy()
    expect(said!.textContent?.trim()).toBe('')
  })

  it('has the host say its waiting line at the foot of the sheet once you have answered', () => {
    render(QuestionStage, { question: open('more_less', 'more_less'), yourValue: 0, onAnswer })
    expect(paper().querySelector('.said')!.textContent?.trim()).toBe(MODES.more_less!.waiting)
  })

  it('has the host say its reveal line beside your points', () => {
    const question = open('more_less', 'more_less')
    const result = { value: 0, correct: true, credit: 1, points: 850 }
    render(QuestionStage, { question, reveal: REVEAL, yourValue: 0, result, onAnswer })
    const said = paper().querySelector('.said')!
    expect(said.querySelector('.line')?.textContent).toBe(MODES.more_less!.reveal)
    expect(said.querySelector('.slot')?.textContent).toContain('+850')
  })

  it('draws the scroll open, as it always is', () => {
    render(QuestionStage, { question: open('more_less', 'more_less'), yourValue: null, onAnswer })
    expect(document.querySelector('.scroll')!.classList.contains('opening')).toBe(false)
  })
})

describe('a pack question’s picture', () => {
  const PROMPT = 'Which of these would a merchant rather hold?'
  const pictured = (picture: string | null) => ({
    ...open('more_less', 'stemmed', { ...VIEW, prompt: PROMPT }),
    picture,
  })
  const paper = () => document.querySelector('.paper') as HTMLElement

  it('is on the scroll under the prompt while the question is open', () => {
    render(QuestionStage, { question: pictured('0123abcd.png'), yourValue: null, onAnswer })
    const img = paper().querySelector('.picture img')!
    expect(img.getAttribute('src')).toBe('/pictures/0123abcd.png')
    expect(img.getAttribute('alt')).toBe('')
    const prompt = screen.getByText(PROMPT)
    expect(prompt.compareDocumentPosition(img) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('stays on the scroll for the reveal', () => {
    render(QuestionStage, {
      question: pictured('0123abcd.png'),
      reveal: { ...REVEAL, prompt: PROMPT },
      yourValue: null,
      onAnswer,
    })
    expect(paper().querySelector('.picture img')!.getAttribute('src')).toBe(
      '/pictures/0123abcd.png',
    )
  })

  it('leaves no image and no empty box without one, open or revealed', () => {
    const { container, unmount } = render(QuestionStage, {
      question: pictured(null),
      yourValue: null,
      onAnswer,
    })
    expect(container.querySelector('.picture, img[src^="/pictures/"]')).toBeNull()
    expect(screen.getByText(PROMPT)).toBeTruthy()
    unmount()

    const revealed = render(QuestionStage, {
      question: pictured(null),
      reveal: { ...REVEAL, prompt: PROMPT },
      yourValue: null,
      onAnswer,
    })
    expect(revealed.container.querySelector('.picture, img[src^="/pictures/"]')).toBeNull()
  })

  it('is never a shadow and has no caption in a mode that does not ask for one', () => {
    render(QuestionStage, {
      question: pictured('0123abcd.png'),
      reveal: { ...REVEAL, prompt: PROMPT, subject: { name: 'Abyssal whip' } },
      yourValue: null,
      onAnswer,
    })
    expect(paper().querySelector('.shadow, .fill, .lifted, .caption, .large')).toBeNull()
  })

  it('is left out of the fallback for a type this build cannot show', () => {
    const question = { ...open('from_a_newer_server', 'stemmed'), picture: '0123abcd.png' }
    const { container } = render(Question, { question, yourValue: null, onAnswer })
    expect(container.querySelector('.picture, img[src^="/pictures/"]')).toBeNull()
  })
})

describe('Who’s That NPC?’s shadow', () => {
  const VIEW_NPC = { prompt: "Who's that NPC?", vocab: 'npcs' }
  const question = { ...open('pick_from_list', 'whos_that_npc', VIEW_NPC), picture: 'feedc0de.png' }
  const paper = () => document.querySelector('.paper') as HTMLElement

  it('is the picture’s outline in the theme’s colour while the question is open', () => {
    render(QuestionStage, { question, yourValue: null, onAnswer })
    const frame = paper().querySelector('.picture.large .frame.shadow')!
    expect(frame.querySelector('img')!.getAttribute('src')).toBe('/pictures/feedc0de.png')
    const fill = frame.querySelector<HTMLElement>('.fill')!
    expect(fill.style.getPropertyValue('--outline')).toBe("url('/pictures/feedc0de.png')")
    expect(frame.classList.contains('lifted')).toBe(false)
    expect(paper().querySelector('.caption')).toBeNull()
  })

  it('fades into the render with its name on the reveal', () => {
    render(QuestionStage, {
      question,
      reveal: { ...VIEW_NPC, answer_id: 8058, subject: { name: 'Vorkath' } },
      yourValue: null,
      onAnswer,
    })
    expect(paper().querySelector('.picture.large img')!.getAttribute('src')).toBe(
      '/pictures/feedc0de.png',
    )
    expect(paper().querySelector('.frame.shadow.lifted .fill')).toBeTruthy()
    expect(paper().querySelector('.caption')!.textContent).toBe('Vorkath')
  })
})

describe('Who’s That NPC?’s render', () => {
  const VIEW_RENDER = {
    prompt: "Who's that NPC?",
    options: ['Dark kebbit', 'Spotted kebbit', 'Dashing kebbit', 'Wild kebbit'],
  }
  const question = {
    ...open('multiple_choice', 'whos_that_npc', VIEW_RENDER),
    picture: 'feedc0de.png',
  }
  const paper = () => document.querySelector('.paper') as HTMLElement

  it('is the whole render, large, over the buttons while the question is open', () => {
    render(QuestionStage, { question, yourValue: null, onAnswer })
    expect(paper().querySelector('.picture.large img')!.getAttribute('src')).toBe(
      '/pictures/feedc0de.png',
    )
    expect(paper().querySelector('.shadow, .fill, .caption')).toBeNull()
    const buttons = [...document.querySelectorAll('button')].map((b) => b.textContent ?? '')
    expect(buttons.filter((text) => text.includes('kebbit'))).toHaveLength(4)
  })

  it('names the right option under the render on the reveal', () => {
    render(QuestionStage, {
      question,
      reveal: { ...VIEW_RENDER, answer_index: 1 },
      yourValue: null,
      onAnswer,
    })
    expect(paper().querySelector('.shadow, .fill')).toBeNull()
    expect(paper().querySelector('.caption')!.textContent).toBe('Spotted kebbit')
  })
})

describe('the pin', () => {
  const question = open('more_less', 'more_less')
  const award = () => document.querySelector('.award') as HTMLElement | null

  function revealed(result: PlayerResult | null) {
    render(QuestionStage, { question, reveal: REVEAL, yourValue: 0, result, onAnswer })
  }

  it('is pinned with confetti for a right answer', () => {
    revealed({ value: 0, correct: true, credit: 1, points: 850 })
    expect(award()?.dataset.award).toBe('confetti')
    expect(award()!.querySelectorAll('.confetti i')).toHaveLength(16)
  })

  it('is pinned without confetti for partial credit', () => {
    revealed({ value: 0, correct: false, credit: 0.9, points: 300 })
    expect(award()?.dataset.award).toBe('pin')
    expect(award()!.querySelector('.confetti')).toBeNull()
  })

  it("is the inn's ribbon without a theme of its own, and the Wilderness's skull for the points", () => {
    const pin = () => award()!.querySelector('img.pin')!.getAttribute('src')
    revealed({ value: 0, correct: false, credit: 0.9, points: 300 })
    expect(pin()).toBe(ribbon)
    cleanup()

    document.documentElement.dataset.theme = 'wilderness'
    try {
      revealed({ value: 0, correct: false, credit: 0.4, points: 300 })
      expect(pin()).toBe(bountySkull2)
      expect(award()!.classList.contains('sprite')).toBe(true)
      cleanup()
      revealed({ value: 0, correct: true, credit: 1, points: 850 })
      expect(pin()).toBe(bountySkull5)
    } finally {
      delete document.documentElement.dataset.theme
    }
  })

  it('is not pinned for +0, for no answer, or while the question is open', () => {
    revealed({ value: 1, correct: false, credit: 0, points: 0 })
    expect(award()).toBeNull()
    cleanup()
    revealed(null)
    expect(award()).toBeNull()
    cleanup()
    render(QuestionStage, { question, yourValue: 0, onAnswer })
    expect(award()).toBeNull()
  })
})

describe('a phone while the TV shows the question', () => {
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

  const TALLY = '3 of 4 got it right'
  const tally = createRawSnippet(() => ({ render: () => `<p>${TALLY}</p>` }))
  const nothingStaged = () => {
    expect(document.querySelector('.stage, .scroll, .paper, .npc')).toBeNull()
    expect(document.querySelector('img')).toBeNull()
  }

  for (const { type, mode, view } of EVERY_TYPE) {
    it(`draws ${type}'s answers without stem, picture or host`, async () => {
      const question = {
        ...open(type, mode, { ...view, explanation: WHY }),
        picture: '0123abcd.png',
      }
      render(QuestionStage, { question, yourValue: null, onAnswer, answersOnly: true })
      await waitFor(() =>
        expect(document.querySelector('.answers button, .answers input')).toBeTruthy(),
      )
      nothingStaged()
      const prompt = (view as { prompt?: string }).prompt
      if (prompt !== undefined) expect(screen.queryByText(prompt)).toBeNull()
    })
  }

  it("draws a random event's answers without its NPC or card", () => {
    const question = {
      ...open('multiple_choice', 'random_event', {
        prompt: 'Which prayer level unlocks Augury?',
        options: ['70', '77', '74'],
      }),
      random_event: 'death',
    }
    render(QuestionStage, { question, yourValue: null, onAnswer, answersOnly: true })
    nothingStaged()
    expect(screen.queryByText('Which prayer level unlocks Augury?')).toBeNull()
    expect(screen.getByRole('button', { name: /77/ })).toBeTruthy()
  })

  it('keeps the waiting line once you have answered', () => {
    const question = open('more_less', 'more_less')
    render(QuestionStage, { question, yourValue: 0, onAnswer, answersOnly: true })
    expect(document.querySelector('.panel.waiting')?.textContent).toContain('Waiting for the room')
  })

  it('gets the whole question back when the TV goes', async () => {
    const view = { prompt: 'Which?', options: ['Zulrah', 'Vorkath'] }
    const question = { ...open('multiple_choice', 'custom', view), picture: 'a.png' }
    const { rerender } = render(QuestionStage, {
      question,
      yourValue: null,
      onAnswer,
      answersOnly: true,
    })
    expect(screen.queryByText('Which?')).toBeNull()
    await rerender({ answersOnly: false })
    expect(document.querySelector('.paper')?.textContent).toContain('Which?')
    expect(document.querySelector('.paper img')).toBeTruthy()
  })

  it('reveals your own answer and points, without the tally, counts or explanation', () => {
    const view = { prompt: 'Which?', options: ['Zulrah', 'Vorkath', 'Kraken'] }
    const question = open('multiple_choice', 'custom', view)
    const results: Record<string, PlayerResult> = {
      you: { value: 1, correct: false, credit: 0, points: 0 },
      ann: { value: 0, correct: true, credit: 1, points: 700 },
      bob: { value: 0, correct: true, credit: 1, points: 650 },
    }
    render(QuestionStage, {
      question,
      reveal: { ...view, answer_index: 0, explanation: WHY },
      yourValue: 1,
      result: results.you,
      results,
      onAnswer,
      answersOnly: true,
      children: tally,
    })
    nothingStaged()
    expect(document.querySelector('.slot')?.textContent).toContain('+0')
    expect(screen.getByRole('button', { name: /Vorkath/ }).textContent).toContain('you')
    expect(document.querySelector('.votes, .bar')).toBeNull()
    expect(screen.queryByText(TALLY)).toBeNull()
    expect(screen.queryByText(WHY)).toBeNull()
  })

  it('reveals the points you scored', () => {
    const question = open('more_less', 'more_less')
    const result = { value: 0, correct: true, credit: 1, points: 850 }
    render(QuestionStage, {
      question,
      reveal: REVEAL,
      yourValue: 0,
      result,
      onAnswer,
      answersOnly: true,
    })
    expect(document.querySelector('.slot')?.textContent).toContain('+850')
  })
})

describe("the room's TV", () => {
  const VIEW_TV = { prompt: 'Which boss drops the tanzanite fang?', options: ['Zulrah', 'Vorkath'] }
  const NAMES = '3 of 4 got it right · Got it wrong: Dave'
  const tally = createRawSnippet(() => ({ render: () => `<p>${NAMES}</p>` }))
  const watching = { ...open('multiple_choice', 'custom', VIEW_TV), you_can_answer: false }
  const person = (id: string, connected = true) => ({
    id,
    display_name: id,
    avatar: null,
    role: 'player' as const,
    team: null,
    connected,
    ready: false,
    editing: false,
  })

  beforeEach(() => {
    players.set([person('Ann'), person('Dave'), person('Bob', false)])
    answerCount.set({ answered: 1, of: 3, waiting: ['Dave', 'Bob'] })
  })

  afterEach(() => {
    players.set([])
    answerCount.set(null)
  })

  it('shows an open question with no answer controls, and the answered count', () => {
    render(QuestionStage, { question: watching, yourValue: null, onAnswer, tv: true })
    expect(document.querySelector('.paper')?.textContent).toContain(VIEW_TV.prompt)
    expect(screen.queryAllByRole('button')).toEqual([])
    expect(document.querySelector('input')).toBeNull()
    const panel = document.querySelector('.tv-panel')!
    expect(panel.textContent).toContain('1 of 3')
    expect(panel.textContent).toContain('answered')
    expect(document.querySelector('.stage.tv:not(.tv-reveal)')).toBeTruthy()
  })

  it('names who is still to answer, leaving out whoever has dropped', () => {
    render(QuestionStage, { question: watching, yourValue: null, onAnswer, tv: true })
    const names = [...document.querySelectorAll('.tv-panel li')].map((li) => li.textContent?.trim())
    expect(names).toEqual(['Dave'])
  })

  it("shows a random event's open question with no answer controls", () => {
    const question = { ...watching, random_event: 'death' }
    render(QuestionStage, { question, yourValue: null, onAnswer, tv: true })
    expect(document.querySelector('.paper')?.textContent).toContain(VIEW_TV.prompt)
    expect(screen.queryAllByRole('button')).toEqual([])
    expect(document.querySelector('.tv-panel')?.textContent).toContain('1 of 3')
  })

  it('reveals the answers with the tally and names, and no points', () => {
    render(QuestionStage, {
      question: watching,
      reveal: { ...VIEW_TV, answer_index: 0 },
      yourValue: null,
      onAnswer,
      tv: true,
      children: tally,
    })
    const panel = document.querySelector('.stage.tv-reveal .tv-panel')!
    expect(panel.textContent).toContain('Zulrah')
    expect(panel.textContent).toContain(NAMES)
    expect(document.querySelector('.slot')).toBeNull()
  })

  it("reveals a random event's tally and names the same way", () => {
    render(QuestionStage, {
      question: { ...watching, random_event: 'death' },
      reveal: { ...VIEW_TV, answer_index: 0 },
      yourValue: null,
      onAnswer,
      tv: true,
      children: tally,
    })
    expect(document.querySelector('.stage.tv-reveal .tv-panel')?.textContent).toContain(NAMES)
    expect(document.querySelector('.slot')).toBeNull()
  })
})
