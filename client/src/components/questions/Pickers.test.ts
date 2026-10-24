/**
 * Who picked what, on the answers of a desktop room's reveal: a pick-one question's gems
 * and More or Less's two cards name their pickers, you first; every other type keeps its
 * reveal, and the names stay in the table panel.
 */

import { render } from '@testing-library/svelte'
import { describe, expect, it } from 'vitest'

import { PICKERS_CONTEXT, RevealPickers, pickersAt } from '../../lib/pickers.svelte'
import type { OpenQuestion, PlayerResult } from '../../lib/protocol'
import Question from './Question.svelte'

const NAMES: Record<string, string> = {
  zez: 'Zezima',
  woox: 'Woox',
  lynx: 'Lynx Titan',
  ash: 'Mod Ash',
  bea: 'B0aty',
  cam: 'Camtorr',
  dan: 'Dan',
}

function room(options: { on?: boolean; showNames?: boolean } = {}): RevealPickers {
  const pickers = new RevealPickers()
  pickers.on = options.on ?? true
  pickers.youId = 'zez'
  pickers.showNames = options.showNames ?? true
  pickers.who = (id) => (NAMES[id] === undefined ? null : { name: NAMES[id], pet: '' })
  return pickers
}

function picked(value: unknown, correct: boolean): PlayerResult {
  return { value, correct, credit: correct ? 1 : 0, points: correct ? 800 : 0 }
}

function open(type: string, view: Record<string, unknown>): OpenQuestion {
  return {
    question_id: 'q1',
    index: 0,
    total: 5,
    type,
    mode: 'custom',
    segment: { mode: 'custom', index: 0, total: 1, start: 0, count: 5 },
    view,
    opened_at: '2026-10-24T20:00:00Z',
    ends_at: '2026-10-24T20:00:20Z',
    you_can_answer: true,
    picture: null,
    random_event: null,
    answerable_at: '2026-10-24T20:00:00Z',
    answered: 0,
    of: 0,
    waiting: [],
  }
}

const CHOICE = {
  prompt: 'Which boss drops the Tanzanite fang?',
  options: ['Zulrah', 'Vorkath', 'Jad'],
}
// Six on Zulrah, the answer; Woox alone on Vorkath; Jad nobody's.
const RESULTS: Record<string, PlayerResult> = {
  woox: picked(1, false),
  lynx: picked(0, true),
  ash: picked(0, true),
  zez: picked(0, true),
  bea: picked(0, true),
  cam: picked(0, true),
  dan: picked(0, true),
}

function reveal(pickers: RevealPickers, results = RESULTS) {
  return render(Question, {
    props: {
      question: open('multiple_choice', CHOICE),
      reveal: { ...CHOICE, answer_index: 0 },
      yourValue: 0,
      result: results.zez ?? null,
      results,
      onAnswer: () => {},
    },
    context: new Map([[PICKERS_CONTEXT, pickers]]),
  })
}

const gem = (label: string) =>
  [...document.querySelectorAll<HTMLElement>('.gem')].find((one) =>
    one.querySelector('.content')?.textContent?.includes(label),
  )!
const names = (label: string) =>
  [...gem(label).querySelectorAll('.picker')].map((picker) => picker.textContent?.trim())

describe('pickers on a multiple choice reveal', () => {
  it('lists each option’s pickers, you first, then A–Z, five on the answer', () => {
    reveal(room())
    expect(names('Zulrah')).toEqual(['you', 'B0aty', 'Camtorr', 'Dan', 'Lynx Titan', 'and 1 more'])
    expect(names('Vorkath')).toEqual(['Woox'])
    expect(gem('Jad').querySelector('.pickers')).toBeNull()
  })

  it('names four on a wrong option, then how many more', () => {
    const results: Record<string, PlayerResult> = {
      zez: picked(0, true),
      ...Object.fromEntries(
        ['woox', 'lynx', 'ash', 'bea', 'cam', 'dan'].map((id) => [id, picked(2, false)]),
      ),
    }
    reveal(room(), results)
    expect(names('Jad')).toEqual(['B0aty', 'Camtorr', 'Dan', 'Lynx Titan', 'and 2 more'])
  })

  it('with name_wrong_answers off shows a wrong option’s count and no names', () => {
    reveal(room({ showNames: false }))
    expect(gem('Vorkath').querySelector('.pickers')).toBeNull()
    expect(gem('Vorkath').querySelector('.votes')?.textContent).toBe('1')
    expect(names('Zulrah')[0]).toBe('you')
  })

  it('names nobody off the desktop room: a phone, the TV, a preview', () => {
    reveal(room({ on: false }))
    expect(document.querySelector('.pickers')).toBeNull()
  })
})

describe('pickers on More or Less', () => {
  it('lists who picked each item under it', () => {
    const view = {
      metric: 'ge_price',
      direction: 'more',
      options: [{ subject: { name: 'Abyssal whip' } }, { subject: { name: 'Rune scimitar' } }],
    }
    render(Question, {
      props: {
        question: { ...open('more_less', view), mode: 'more_less' },
        reveal: {
          ...view,
          answer_index: 0,
          options: [
            { ...view.options[0], value: 1_500_000 },
            { ...view.options[1], value: 15_000 },
          ],
        },
        yourValue: 1,
        result: picked(1, false),
        results: { zez: picked(1, false), woox: picked(0, true) },
        onAnswer: () => {},
      },
      context: new Map([[PICKERS_CONTEXT, room()]]),
    })
    expect(names('Abyssal whip')).toEqual(['Woox'])
    expect(names('Rune scimitar')).toEqual(['you'])
  })
})

describe('pickers elsewhere', () => {
  it('leave an ordering reveal unchanged', () => {
    const shown = ['Mithril', 'Bronze', 'Adamant']
    const view = {
      prompt: 'Put these metals in order.',
      ends: ['Weakest', 'Strongest'],
      entries: shown.map((text) => ({ text })),
    }
    render(Question, {
      props: {
        question: open('ordering', view),
        reveal: {
          ...view,
          entries: shown.map((text, i) => ({ text, rank: [2, 1, 3][i] })),
          answer: [1, 0, 2],
        },
        yourValue: [1, 0, 2],
        result: picked([1, 0, 2], true),
        results: { zez: picked([1, 0, 2], true), woox: picked([0, 1, 2], false) },
        onAnswer: () => {},
      },
      context: new Map([[PICKERS_CONTEXT, room()]]),
    })
    expect(document.querySelector('.pickers')).toBeNull()
  })

  it('call one who left by the name they had, or “Someone who left”', () => {
    const results = { gone: picked(0, true), zez: picked(0, true) }
    expect(pickersAt(room(), results, 0, true)?.shown.map((one) => one.name)).toEqual([
      'you',
      'Someone who left',
    ])
    expect(pickersAt(null, results, 0, true)).toBeNull()
  })
})
