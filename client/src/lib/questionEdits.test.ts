/** The pack editor's helpers: what an edit sends, the search, and a payload typed as JSON. */

import { describe, expect, it } from 'vitest'

import { draftOf, questionOf, type CustomType } from './customQuestions'
import { draftOf as orderingDraftOf, questionOf as orderingQuestionOf } from './ordering'
import { editOf, envelopeOf, parsePayload, searchQuestions } from './questionEdits'
import type { PackQuestion } from './reports'

function question(id: string, prompt: string, over: Partial<PackQuestion> = {}): PackQuestion {
  return {
    id,
    type: 'multiple_choice',
    mode: 'bestiary',
    payload: { prompt, options: ['a', 'b'], answer_index: 0 },
    ...over,
  }
}

describe('an edit', () => {
  it('carries the fields a question may change, and only the ones it has', () => {
    const credited = question('q_a', 'Q?', {
      wiki: 'https://oldschool.runescape.wiki/w/Jad',
      credit: 'Zezima',
    })
    expect(editOf(credited)).toEqual({
      payload: credited.payload,
      wiki: credited.wiki,
      credit: 'Zezima',
    })
  })

  it('leaves out what was emptied, and a shown credit without a name', () => {
    expect(
      envelopeOf({ wiki: ' ', sourceUrl: ' https://x.test ', credit: '', creditShown: true }),
    ).toEqual({
      source_url: 'https://x.test',
    })
    expect(envelopeOf({ wiki: '', sourceUrl: '', credit: ' Zezima ', creditShown: true })).toEqual({
      credit: 'Zezima',
      credit_shown: true,
    })
  })
})

describe('the search', () => {
  const questions = [
    question('q_a', 'Which dragon is metal?'),
    question('q_b', 'How many Zúlrah phases?'),
  ]

  it('keeps every question for an empty query, and folds case and accents', () => {
    expect(searchQuestions(questions, '  ')).toHaveLength(2)
    expect(searchQuestions(questions, 'zulrah').map((q) => q.id)).toEqual(['q_b'])
  })

  it('wants every word, anywhere in the line', () => {
    expect(searchQuestions(questions, 'metal dragon').map((q) => q.id)).toEqual(['q_a'])
    expect(searchQuestions(questions, 'metal phases')).toEqual([])
  })
})

describe('a payload typed as JSON', () => {
  it('is an object, or says why not', () => {
    expect(parsePayload('{"prompt": "Q"}')).toEqual({ prompt: 'Q' })
    expect(parsePayload('{')).toBe('Not valid JSON.')
    expect(parsePayload('[1]')).toBe('The payload is a JSON object.')
  })
})

describe('the forms the editor opens', () => {
  const files = import.meta.glob<{ questions: PackQuestion[] }>('../../../data/packs/**/*.json', {
    eager: true,
    import: 'default',
  })
  const questions = Object.entries(files)
    .filter(([path]) => !/prices|sample/.test(path))
    .flatMap(([, file]) => file.questions)

  it('give every hand-written question back unchanged when nothing is edited', () => {
    // A list's answer is an id no form writes, and matching has no form here yet.
    const forms = questions.filter((q) => q.type !== 'pick_from_list' && q.type !== 'matching')
    expect(forms.length).toBeGreaterThan(100)
    for (const question of forms) {
      const payload =
        question.type === 'ordering'
          ? orderingQuestionOf(orderingDraftOf({ type: 'ordering', payload: question.payload }))
              .payload
          : questionOf(draftOf({ type: question.type as CustomType, payload: question.payload }))
              .payload
      expect(payload, question.id).toEqual(question.payload)
    }
  })
})
