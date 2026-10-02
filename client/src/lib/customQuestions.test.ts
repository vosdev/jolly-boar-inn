/**
 * The host's questions are held to what `POST /api/rooms` would hold them to, before it is
 * asked: the schema's limits, read from the schema, then each type's own `check()`. The
 * file Export writes is the one Import reads, to the byte.
 */

import { describe, expect, it } from 'vitest'

import SCHEMA from '../../../schema/question.schema.json'
import {
  draftOf,
  eventSlots,
  exportText,
  importText,
  normalize,
  overCap,
  previewOf,
  problems,
  questionOf,
  type CustomQuestion,
} from './customQuestions'
import { RANDOM_EVENTS } from './randomEvents'

const CHOICE: CustomQuestion = {
  type: 'multiple_choice',
  payload: { prompt: 'Who runs the Jolly Boar Inn?', options: ['Bartender', 'Hans'], answer_index: 0 },
}
const TEXT: CustomQuestion = {
  type: 'free_text',
  payload: { prompt: 'Name the cat in Gertrude’s Cat.', accepted: ['Fluffs'], max_distance: 2 },
  random_event: 'bob',
}
const NUMBER: CustomQuestion = {
  type: 'closest_number',
  payload: { prompt: 'Zulrah kills for a pet, on average?', answer: 4000, unit: 'kills', explanation: '1/4000.' },
  random_event: 'death',
}

function paths(question: unknown): string[] {
  return problems(question).map((problem) => `${problem.path}: ${problem.message}`)
}

describe('problems', () => {
  it('passes a well-formed question of each of the three types', () => {
    for (const question of [CHOICE, TEXT, NUMBER]) expect(paths(question)).toEqual([])
  })

  it('reads its limits from the schema, the six-choice cap included', () => {
    const max = SCHEMA.$defs.choices.maxItems
    const prompt = SCHEMA.$defs.prompt.maxLength
    const options = Array.from({ length: max + 1 }, (_, i) => `Answer ${i}`)
    expect(paths({ ...CHOICE, payload: { ...CHOICE.payload, options } })).toEqual([
      `payload.options: At most ${max} answers.`,
    ])
    expect(paths({ ...CHOICE, payload: { ...CHOICE.payload, prompt: 'x'.repeat(prompt) } })).toEqual([])
    expect(paths({ ...CHOICE, payload: { ...CHOICE.payload, prompt: 'x'.repeat(prompt + 1) } })).toEqual([
      `payload.prompt: At most ${prompt} characters; this has ${prompt + 1}.`,
    ])
  })

  it('counts length in code points, as the server does', () => {
    const prompt = '🐗'.repeat(SCHEMA.$defs.prompt.maxLength)
    expect(paths({ ...CHOICE, payload: { ...CHOICE.payload, prompt } })).toEqual([])
  })

  it('refuses two answers that read the same, and a right answer that is not one', () => {
    const payload = { prompt: 'Q', options: ['Hans', ' hans  ', 'Bob'], answer_index: 3 }
    expect(paths({ type: 'multiple_choice', payload })).toEqual([
      'payload.answer_index: Pick one of the answers.',
      'payload.options[1]: Same as answer 1.',
    ])
  })

  it('refuses an accepted answer nothing could match', () => {
    const payload = { prompt: 'Q', accepted: ['Fluffs', '?!'] }
    expect(paths({ type: 'free_text', payload })).toEqual([
      'payload.accepted[1]: Only punctuation and spaces: nothing could match it.',
    ])
  })

  it('refuses an answer that is not a number', () => {
    expect(paths({ ...NUMBER, payload: { ...NUMBER.payload, answer: '1,5' } })).toEqual([
      'payload.answer: Must be a number, like 1500 or 2.5.',
    ])
  })

  it('refuses text the database cannot store', () => {
    expect(paths({ ...CHOICE, payload: { ...CHOICE.payload, prompt: 'a\ud800b' } })).toEqual([
      'payload.prompt: Holds a character that can’t be stored.',
    ])
  })

  it('refuses an NPC the roster does not have, a field nobody wrote, and the other types', () => {
    expect(paths({ ...CHOICE, random_event: 'zezima' })).toEqual([
      'random_event: “zezima” is not an NPC this game knows.',
    ])
    expect(paths({ ...CHOICE, payload: { ...CHOICE.payload, colour: 'red' } })).toEqual([
      'payload.colour: “colour” is not a field of this question.',
    ])
    expect(paths({ ...CHOICE, id: 'q_0000000000000000' })[0]).toMatch(/^id: “id” is not part of a question here/)
    expect(paths({ type: 'pick_from_list', payload: {} })).toEqual([
      'type: Must be one of multiple_choice, free_text, closest_number.',
    ])
  })
})

describe('the form', () => {
  it('opens a question and writes it back unchanged', () => {
    for (const question of [CHOICE, TEXT, NUMBER]) expect(questionOf(draftOf(question))).toEqual(question)
  })

  it('leaves random_event out when Random asks, which a new question starts on', () => {
    const draft = draftOf()
    expect(draft.npc).toBe('')
    expect('random_event' in questionOf(draft)).toBe(false)
    expect(questionOf({ ...draft, npc: 'genie' }).random_event).toBe('genie')
  })

  it('trims, and leaves empty optional fields and the default typo allowance out', () => {
    const draft = { ...draftOf({ ...TEXT, payload: { ...TEXT.payload, max_distance: 1 } }), prompt: ' Q ', explanation: '  ' }
    expect(questionOf(draft).payload).toEqual({ prompt: 'Q', accepted: ['Fluffs'] })
  })

  it('keeps a field it has no control for, but only on a type that has it', () => {
    const subject = { name: 'Fluffs' }
    const draft = draftOf({ ...TEXT, payload: { ...TEXT.payload, subject, image: 'item:1555' } })
    expect(questionOf(draft).payload).toMatchObject({ subject, image: 'item:1555' })
    const asChoice = questionOf({ ...draft, type: 'multiple_choice' }).payload
    expect(asChoice).toMatchObject({ image: 'item:1555' })
    expect(asChoice).not.toHaveProperty('subject')
  })

  it('previews it as an open random event, answerable now, with only what players see', () => {
    const preview = previewOf(NUMBER)
    expect(preview.random_event).toBe('death')
    expect(preview.view).toEqual({ prompt: NUMBER.payload.prompt, unit: 'kills' })
    expect(Date.parse(preview.answerable_at!)).toBeLessThan(Date.now())
    expect(previewOf(CHOICE).random_event).toBe('')
  })
})

describe('export and import', () => {
  it('round-trips to a byte-identical file, the chosen NPCs included', () => {
    const text = exportText([CHOICE, TEXT, NUMBER])
    const imported = importText(text)
    expect(imported.ok).toBe(true)
    if (!imported.ok) return
    expect(imported.questions.map((q) => q.random_event)).toEqual([undefined, 'bob', 'death'])
    expect(exportText(imported.questions)).toBe(text)
  })

  it('refuses a bad file with a readable message for each problem', () => {
    expect(importText('{')).toEqual({ ok: false, errors: ['This file is not JSON.'] })
    expect(importText('{"questions": []}')).toEqual({
      ok: false,
      errors: ['This file should be a list of questions, the way Export writes it.'],
    })
    const bad = [CHOICE, { ...TEXT, random_event: 'zezima' }, { ...CHOICE, payload: { ...CHOICE.payload, options: ['A'] } }]
    expect(importText(JSON.stringify(bad))).toEqual({
      ok: false,
      errors: [
        'Question 2, NPC: “zezima” is not an NPC this game knows.',
        'Question 3, answers: At least 2 answers.',
      ],
    })
  })

  it('takes an id from every NPC on the roster', () => {
    const all = RANDOM_EVENTS.map((npc) => ({ ...CHOICE, random_event: npc.id }))
    expect(importText(exportText(all)).ok).toBe(true)
  })
})

describe('the event cap', () => {
  it('counts slots as the server does: one per whole window, none in a window of round ends', () => {
    expect(eventSlots([40], 10)).toBe(4)
    expect(eventSlots([39], 10)).toBe(3)
    expect(eventSlots([5, 5], 5)).toBe(2)
    expect(eventSlots([1, 1, 1, 1, 1, 5], 5)).toBe(1)
    expect(eventSlots([], 10)).toBe(0)
  })

  it('names the count, the limit and the frequency, and says when More would help', () => {
    expect(overCap(4, 4, 'default', 8)).toBeNull()
    expect(overCap(5, 4, 'default', 8)).toBe(
      'Your rounds make room for 4 random events at Default frequency, and you have 5 questions of your own. More frequency would make room for 8.',
    )
    expect(overCap(9, 8, 'more', 8)).toBe(
      'Your rounds make room for 8 random events at More frequency, and you have 9 questions of your own. Add questions to the rounds, or remove 1 of yours.',
    )
  })
})

describe('normalize', () => {
  it('folds case, width, punctuation and spacing as the server does', () => {
    expect(normalize("  K'RIL   Tsutsaroth! ")).toBe('kril tsutsaroth')
    expect(normalize('Ｚｅｚｉｍａ')).toBe('zezima')
  })
})
