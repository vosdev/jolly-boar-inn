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
  withinFor,
  type CustomQuestion,
} from './customQuestions'
import { ASKERS } from './randomEvents'

const CHOICE: CustomQuestion = {
  type: 'multiple_choice',
  payload: {
    prompt: 'Who runs the Jolly Boar Inn?',
    options: ['Bartender', 'Hans'],
    answer_index: 0,
  },
}
const TEXT: CustomQuestion = {
  type: 'free_text',
  payload: { prompt: 'Name the cat in Gertrude’s Cat.', accepted: ['Fluffs'], max_distance: 2 },
  random_event: 'bob',
}
const NUMBER: CustomQuestion = {
  type: 'closest_number',
  payload: {
    prompt: 'Zulrah kills for a pet, on average?',
    answer: 4000,
    unit: 'kills',
    explanation: '1/4000.',
  },
  random_event: 'death',
}
const PICK_ALL: CustomQuestion = {
  type: 'pick_all_that_apply',
  payload: {
    prompt: 'Which of these are demons?',
    options: ['Hellhound', 'Gargoyle', 'Imp'],
    answer_indices: [0, 2],
    picks: 2,
  },
}

function paths(question: unknown): string[] {
  return problems(question).map((problem) => `${problem.path}: ${problem.message}`)
}

describe('problems', () => {
  it('passes a well-formed question of each of the four types', () => {
    for (const question of [CHOICE, TEXT, NUMBER, PICK_ALL]) expect(paths(question)).toEqual([])
  })

  it('reads its limits from the schema, the six-choice cap included', () => {
    const max = SCHEMA.$defs.choices.maxItems
    const prompt = SCHEMA.$defs.prompt.maxLength
    const options = Array.from({ length: max + 1 }, (_, i) => `Answer ${i}`)
    expect(paths({ ...CHOICE, payload: { ...CHOICE.payload, options } })).toEqual([
      `payload.options: At most ${max} answers.`,
    ])
    expect(
      paths({ ...CHOICE, payload: { ...CHOICE.payload, prompt: 'x'.repeat(prompt) } }),
    ).toEqual([])
    expect(
      paths({ ...CHOICE, payload: { ...CHOICE.payload, prompt: 'x'.repeat(prompt + 1) } }),
    ).toEqual([`payload.prompt: At most ${prompt} characters; this has ${prompt + 1}.`])
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

  it('refuses a pick all that apply with no answer right, but allows every one', () => {
    const { picks: _, ...open } = PICK_ALL.payload
    expect(paths({ ...PICK_ALL, payload: { ...open, answer_indices: [] } })).toContain(
      'payload.answer_indices: Tick at least one right answer.',
    )
    expect(paths({ ...PICK_ALL, payload: { ...open, answer_indices: [0, 1, 2] } })).toEqual([])
    expect(
      paths({ ...PICK_ALL, payload: { ...open, options: ['Imp', 'imp', 'Hellhound'] } }),
    ).toEqual(['payload.options[1]: Same as answer 1.'])
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
    expect(paths({ ...CHOICE, id: 'q_0000000000000000' })[0]).toMatch(
      /^id: “id” is not part of a question here/,
    )
    expect(paths({ type: 'pick_from_list', payload: {} })).toEqual([
      'type: Must be one of multiple_choice, free_text, closest_number, number_slider, pick_all_that_apply.',
    ])
  })
})

describe('a slider', () => {
  const SLIDER: CustomQuestion = {
    type: 'number_slider',
    payload: {
      prompt: 'Runite ore needs what Mining level?',
      answer: 85,
      min: 1,
      max: 99,
      scale: 'linear',
    },
  }
  const slider = (changes: Record<string, unknown>) =>
    paths({ ...SLIDER, payload: { ...SLIDER.payload, ...changes } })

  it('passes with its ends, and is refused without them', () => {
    expect(paths(SLIDER)).toEqual([])
    const { min: _min, max: _max, ...bare } = SLIDER.payload
    expect(paths({ ...SLIDER, payload: bare })).toEqual([
      'payload.min: Required.',
      'payload.max: Required.',
    ])
  })

  it('holds the track and the answer to number_slider.check()', () => {
    expect(slider({ min: 99, max: 1 })).toEqual(['payload.max: Must be above the lowest.'])
    expect(slider({ scale: 'log', min: 0 })).toEqual([
      'payload.min: A log slider starts at 1 or more.',
    ])
    expect(slider({ scale: 'log', max: 1234, answer: 85 })).toEqual([
      'payload.max: A log slider takes three significant figures at most.',
    ])
    expect(slider({ scale: 'log', max: 9990, answer: 1234 })).toEqual([
      'payload.answer: A log slider takes three significant figures at most.',
    ])
    expect(slider({ answer: 99 })).toEqual([
      'payload.answer: Must lie between the lowest and the highest.',
    ])
    expect(slider({ answer: 50 })).toEqual([
      'payload.answer: The slider starts here: move the answer or the ends.',
    ])
  })

  it('takes the scale its ends suggest until one is picked', () => {
    const draft = {
      ...draftOf(),
      type: 'number_slider' as const,
      answer: '30',
      min: '5',
      max: '99',
    }
    expect(questionOf(draft).payload.scale).toBe('linear')
    expect(questionOf({ ...draft, min: '1' }).payload.scale).toBe('log')
    expect(questionOf({ ...draft, min: '1', scale: 'linear' }).payload.scale).toBe('linear')
    expect(draftOf(SLIDER).scale).toBe('linear')
    expect(questionOf(draftOf(SLIDER))).toEqual(SLIDER)
  })

  it('previews its track to players, not its answer', () => {
    expect(previewOf(SLIDER).view).toEqual({
      prompt: SLIDER.payload.prompt,
      min: 1,
      max: 99,
      scale: 'linear',
    })
  })
})

describe('a closest number', () => {
  const near = (within: number) => ({ ...NUMBER, payload: { ...NUMBER.payload, within } })

  it('turns a share of the answer into within, whole for a whole answer', () => {
    expect(withinFor(850, 0)).toBeNull()
    expect(withinFor(850, 10)).toBe(85)
    expect(withinFor(-850, 10)).toBe(85)
    expect(withinFor(13, 5)).toBe(1)
    expect(withinFor(2.5, 5)).toBe(0.125)
    expect(withinFor(0, 25)).toBeNull()
  })

  it('writes the share picked as within, and leaves it out for exact only', () => {
    const draft = draftOf(NUMBER)
    expect(draft.withinPercent).toBe(0)
    expect(questionOf(draft).payload).not.toHaveProperty('within')
    expect(questionOf({ ...draft, withinPercent: 25 }).payload.within).toBe(1000)
    expect(questionOf({ ...draft, withinPercent: 25, answer: '2013' }).payload.within).toBe(503)
  })

  it('opens a within as the share that gives it, or keeps one no share gives', () => {
    expect(draftOf(near(400))).toMatchObject({ withinPercent: 10, withinKept: null })
    expect(draftOf(near(7))).toMatchObject({ withinPercent: null, withinKept: 7 })
    expect(questionOf(draftOf(near(7)))).toEqual(near(7))
    expect(questionOf({ ...draftOf(near(7)), answer: '9000' }).payload.within).toBe(7)
    expect(questionOf({ ...draftOf(near(7)), withinPercent: 0 }).payload).not.toHaveProperty(
      'within',
    )
  })

  it('refuses a within that is not above 0', () => {
    expect(paths(near(0))).toEqual([expect.stringMatching(/^payload\.within: /)])
  })

  it('previews how close scores to players, not the answer', () => {
    expect(previewOf(near(400)).view).toEqual({
      prompt: NUMBER.payload.prompt,
      within: 400,
      unit: 'kills',
    })
  })
})

describe('the form', () => {
  it('opens a question and writes it back unchanged', () => {
    for (const question of [CHOICE, TEXT, NUMBER, PICK_ALL]) {
      expect(questionOf(draftOf(question))).toEqual(question)
    }
  })

  it('sets picks to the count ticked, sorted, and only when players are told it', () => {
    const draft = { ...draftOf(PICK_ALL), answerIndices: [2, 1] }
    expect(draft.picksShown).toBe(true)
    expect(questionOf(draft).payload).toMatchObject({ answer_indices: [1, 2], picks: 2 })
    expect(questionOf({ ...draft, picksShown: false }).payload).not.toHaveProperty('picks')
  })

  it('leaves random_event out when Random asks, which a new question starts on', () => {
    const draft = draftOf()
    expect(draft.npc).toBe('')
    expect('random_event' in questionOf(draft)).toBe(false)
    expect(questionOf({ ...draft, npc: 'genie' }).random_event).toBe('genie')
  })

  it('trims, and leaves empty optional fields and the default typo allowance out', () => {
    const draft = {
      ...draftOf({ ...TEXT, payload: { ...TEXT.payload, max_distance: 1 } }),
      prompt: ' Q ',
      explanation: '  ',
    }
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

  it('edits the intro and the picture, trimmed, and leaves them out when emptied', () => {
    const draft = draftOf({
      ...TEXT,
      payload: { ...TEXT.payload, intro: 'Hm.', image: 'npc:2042' },
    })
    expect([draft.intro, draft.image]).toEqual(['Hm.', 'npc:2042'])
    const edited = questionOf({ ...draft, intro: '  Hmm, yes.  ', image: '' }).payload
    expect(edited.intro).toBe('Hmm, yes.')
    expect(edited).not.toHaveProperty('image')
  })

  it('previews it as an open random event, answerable now, with only what players see', () => {
    const preview = previewOf(NUMBER)
    expect(preview.random_event).toBe('death')
    expect(preview.view).toEqual({ prompt: NUMBER.payload.prompt, unit: 'kills' })
    expect(Date.parse(preview.answerable_at!)).toBeLessThan(Date.now())
    expect(previewOf(CHOICE).random_event).toBe('')
    expect(previewOf(PICK_ALL).view).toEqual({
      prompt: PICK_ALL.payload.prompt,
      options: PICK_ALL.payload.options,
      picks: 2,
    })
  })
})

describe('a quotation', () => {
  const QUOTED: CustomQuestion = {
    type: 'multiple_choice',
    payload: {
      prompt: 'Who said this?',
      quote: 'Never gonna give you up',
      options: ['Rick', 'Zezima'],
      answer_index: 0,
    },
  }

  it('is read into the form and written back, trimmed, and left out when empty', () => {
    expect(draftOf(QUOTED).quote).toBe('Never gonna give you up')
    expect(questionOf(draftOf(QUOTED))).toEqual(QUOTED)
    const empty = draftOf(QUOTED)
    empty.quote = '  '
    expect(questionOf(empty).payload).not.toHaveProperty('quote')
  })

  it('is held to the schema’s length', () => {
    const long = { ...QUOTED, payload: { ...QUOTED.payload, quote: 'x'.repeat(301) } }
    expect(paths(long)).toEqual(['payload.quote: At most 300 characters; this has 301.'])
  })

  it('is shown in the preview as the round shows it', () => {
    expect(previewOf(QUOTED, 'who_said_that').view.quote).toBe('Never gonna give you up')
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
    const bad = [
      CHOICE,
      { ...TEXT, random_event: 'zezima' },
      { ...CHOICE, payload: { ...CHOICE.payload, options: ['A'] } },
    ]
    expect(importText(JSON.stringify(bad))).toEqual({
      ok: false,
      errors: [
        'Question 2, NPC: “zezima” is not an NPC this game knows.',
        'Question 3, answers: At least 2 answers.',
      ],
    })
  })

  it('takes an id from every NPC who may ask', () => {
    const all = ASKERS.map((npc) => ({ ...CHOICE, random_event: npc.id }))
    expect(importText(exportText(all)).ok).toBe(true)
  })

  it('refuses Certer, who only sketches items', () => {
    expect(importText(exportText([{ ...CHOICE, random_event: 'certer' }])).ok).toBe(false)
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
