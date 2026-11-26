/** The trivia questions page's words, from each mode's sample. */

import { describe, expect, it } from 'vitest'

import { triviaQuestions, type TriviaMode } from './triviaQuestions'

const base = { hint: 'The hint.', ask: 'The host asks.', pictured: false }

function one(mode: Partial<TriviaMode> & Pick<TriviaMode, 'sample'>) {
  return triviaQuestions([{ id: 'm', label: 'Some Mode', ...base, ...mode }])[0]
}

describe('triviaQuestions', () => {
  it('writes out a multiple choice question with its options and answer', () => {
    expect(
      one({
        sample: {
          type: 'multiple_choice',
          view: { prompt: 'Which?', options: ['A', 'B', 'C'] },
          answer: 1,
        },
      }),
    ).toEqual({
      mode: 'm',
      label: 'Some Mode',
      hint: 'The hint.',
      path: '/how-to-play/some-mode',
      question: 'Which?',
      options: ['A', 'B', 'C'],
      answer: 'B',
    })
  })

  it('lets the host ask a quote-only question, with the quote under it', () => {
    const question = one({
      sample: { type: 'multiple_choice', view: { quote: 'Hi.', options: ['A', 'B'] }, answer: 0 },
    })
    expect(question?.question).toBe('The host asks.')
    expect(question?.quote).toBe('Hi.')
  })

  it('words More or Less by its metric and gives both values', () => {
    const question = one({
      sample: {
        type: 'more_less',
        view: {
          metric: 'ge_price',
          direction: 'less',
          as_of: '2026-10-01',
          options: [{ subject: { name: 'Lobster' } }, { subject: { name: 'Shark' } }],
        },
        answer: 0,
        values: [150, 1200],
      },
    })
    expect(question?.question).toBe('Which costs less on the Grand Exchange?')
    expect(question?.answer).toBe('Lobster')
    expect(question?.detail).toBe('Lobster: 150 gp, Shark: 1,200 gp. Prices as of 1 October 2026.')
  })

  it('names the item a price question asks about and its price', () => {
    const question = one({
      sample: {
        type: 'price_is_right',
        view: { subject: { name: 'Dragon boots' }, min: 1, max: 2, as_of: '2026-10-28' },
        value: 130000,
      },
    })
    expect(question).toMatchObject({
      question: 'The host asks.',
      subject: 'Dragon boots',
      answer: '130,000 gp',
      detail: 'Prices as of 28 October 2026.',
    })
  })

  it('answers an ordering with the picked top, and every fact beside it', () => {
    const question = one({
      sample: {
        type: 'ordering',
        view: {
          prompt: 'Best two?',
          picks: 2,
          entries: [{ text: 'X' }, { text: 'Y' }, { text: 'Z' }],
        },
        reveal: [
          { rank: 3, detail: 'three' },
          { rank: 1, detail: 'one' },
          { rank: 2, detail: 'two' },
        ],
      },
    })
    expect(question?.options).toEqual(['X', 'Y', 'Z'])
    expect(question?.answer).toBe('Y, Z')
    expect(question?.detail).toBe('Y: one. Z: two. X: three.')
  })

  it('gives a list question its clues, or its verse as a quote', () => {
    const subject = { name: 'Abyssal whip' }
    const clued = one({
      sample: {
        type: 'pick_from_list',
        view: { prompt: 'Who am I?', clues: ['One', 'Two'] },
        answer: 1,
        subject,
      },
    })
    expect(clued).toMatchObject({
      question: 'Who am I?',
      clues: ['One', 'Two'],
      answer: 'Abyssal whip',
    })
    const verse = one({
      sample: { type: 'pick_from_list', view: { prompt: 'A lash.' }, answer: 1, subject },
    })
    expect(verse).toMatchObject({ question: 'The host asks.', quote: 'A lash.' })
  })

  it('leaves out a pictured mode and a mode without a sample', () => {
    const sample = {
      type: 'pick_from_list',
      view: { prompt: 'Which item is this?' },
      answer: 1,
      subject: { name: 'X' },
    } as const
    expect(
      triviaQuestions([
        { id: 'a', label: 'A', ...base, pictured: true, sample },
        { id: 'b', label: 'B', ...base },
      ]),
    ).toEqual([])
  })
})
