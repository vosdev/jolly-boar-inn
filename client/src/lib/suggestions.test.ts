/** What a suggestion is checked against before it is sent, and how the queue reads one. */

import { beforeEach, describe, expect, it } from 'vitest'

import { stemLines } from '../components/questions/index'
import { savePastGame } from './history'
import { rulesOf, SUGGESTIBLE } from './modeRules'
import {
  CHOICES,
  answerOf,
  placeProblem,
  placePrompt,
  choiceOf,
  creditProblem,
  existingMode,
  exportName,
  hasExtras,
  hasRound,
  hostOf,
  inGameOrder,
  itemProblem,
  matchLine,
  maySuggest,
  NO_ROUND,
  npcNameProblem,
  pictureItemProblem,
  placedIn,
  questionPreview,
  retryIn,
  roundsFor,
  similarKey,
  sourceProblems,
  stepsFor,
  summary,
  wikiProblem,
  type QuestionContent,
  itemPage,
  plainItems,
  VERSE_MAX,
  verseItemProblem,
  verseProblem,
} from './suggestions'

const QUESTION = {
  type: 'multiple_choice' as const,
  mode: 'odd_one_out',
  wiki: 'https://oldschool.runescape.wiki/w/Barrows_Brothers',
  payload: {
    prompt: 'Which is not a Barrows brother?',
    options: ['Dharok', 'Hazelmere'],
    answer_index: 1,
  },
}

beforeEach(() => localStorage.clear())

describe('who may suggest', () => {
  it('is a browser that has finished a game', () => {
    expect(maySuggest()).toBe(false)
    savePastGame({
      code: 'ABYSSAL',
      finishedAt: '2026-10-01T20:05:00Z',
      standings: [],
      youId: null,
    })
    expect(maySuggest()).toBe(true)
  })
})

describe('where a question was checked', () => {
  it('takes a wiki page, another https link, or both, and needs one', () => {
    const wiki = 'https://oldschool.runescape.wiki/w/Zezima'
    const clip = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
    expect(Object.values(sourceProblems(wiki, ''))).toEqual([null, null, null])
    expect(Object.values(sourceProblems('', clip))).toEqual([null, null, null])
    expect(Object.values(sourceProblems(wiki, clip))).toEqual([null, null, null])
    expect(sourceProblems('', '  ').either).toMatch(/or another https link/)
  })

  it('holds what is filled in to its form', () => {
    expect(sourceProblems('https://example.com/w/Zezima', '').wiki).toMatch(
      /oldschool\.runescape\.wiki/,
    )
    expect(sourceProblems('', 'http://example.com').source_url).toBe('A link starting https://.')
    expect(sourceProblems('', `https://example.com/${'x'.repeat(300)}`).source_url).toMatch(
      /At most 300/,
    )
  })
})

describe('the choices', () => {
  it('are an item, an NPC question, the rounds, and last a question with no round', () => {
    const trivia = [
      'multiple_choice',
      'free_text',
      'closest_number',
      'number_slider',
      'pick_all_that_apply',
      'ordering',
      'matching',
    ]
    expect(CHOICES.map((choice) => [choice.id, choice.types])).toEqual([
      ['item', []],
      ['random_event', trivia],
      ['guess_examine', ['multiple_choice']],
      ['bestiary', trivia],
      ['drop_table', trivia.filter((type) => type !== 'ordering')],
      ['odd_one_out', ['multiple_choice']],
      ['minigame_madness', trivia],
      ['who_said_that', ['multiple_choice']],
      [
        'know_your_content_creator',
        ['multiple_choice', 'closest_number', 'number_slider', 'pick_all_that_apply'],
      ],
      ['scaperune', ['multiple_choice']],
      ['tales_of_gielinor', trivia],
      ['uris_unravelling', trivia],
      ['slayer_master', trivia],
      ['whos_that_npc', ['pick_from_list', 'multiple_choice']],
      ['forgetful_bard', ['pick_from_list']],
      ['mark_the_map', ['map_pin']],
      ['sort_it_out', ['ordering']],
      ['kgp_recon', ['map_pin']],
      ['prop_hunt', ['picture_pin']],
      ['riddles_of_the_sphinx', ['pick_from_list']],
      ['minimap_guesser', ['map_pin']],
      ['lost_in_gielinor', ['map_pin']],
      ['no_round', trivia],
    ])
    const scaperune = CHOICES.find((c) => c.id === 'scaperune')
    expect([scaperune?.types, scaperune?.options, scaperune?.wording?.option]).toEqual([
      ['multiple_choice'],
      [4, 4],
      'question',
    ])
    const examine = CHOICES.find((c) => c.id === 'guess_examine')
    expect([examine?.kind, examine?.types, examine?.options]).toEqual([
      'question',
      ['multiple_choice'],
      [4, 6],
    ])
    expect(examine?.host).toBe('examiner')
    expect(CHOICES.filter((c) => c.wikiOnly).map((c) => c.id)).toEqual([
      'guess_examine',
      'whos_that_npc',
      'mark_the_map',
      'minimap_guesser',
      'lost_in_gielinor',
    ])
    const npc = CHOICES.find((c) => c.id === 'whos_that_npc')
    expect([npc?.types, npc?.host, npc?.prompt, npc?.editor]).toEqual([
      ['pick_from_list', 'multiple_choice'],
      'postie_pete',
      { text: "Who's that NPC?", fixed: true },
      'shadow',
    ])
    expect(CHOICES.filter((c) => c.options !== undefined).map((c) => c.id)).toEqual([
      'guess_examine',
      'odd_one_out',
      'scaperune',
    ])
    expect(CHOICES.find((c) => c.id === 'odd_one_out')?.options).toEqual(
      rulesOf('odd_one_out')?.options,
    )
    const sort = CHOICES.find((c) => c.id === 'sort_it_out')
    expect(sort?.host).toBe('historian_minas')
    expect(sort?.hint).toBe('Something worth putting in order.')
    expect(CHOICES.filter((c) => c.pictureItem).map((c) => c.id)).toEqual([
      'drop_table',
      'minigame_madness',
    ])
    const quoting = CHOICES.filter((c) => c.quote).map((c) => c.id)
    expect(quoting).toEqual(['who_said_that', 'know_your_content_creator', 'uris_unravelling'])
    const silent = CHOICES.filter((c) => c.explanation === false).map((c) => c.id)
    expect(silent).toEqual([
      'guess_examine',
      'whos_that_npc',
      'forgetful_bard',
      'mark_the_map',
      'prop_hunt',
      'riddles_of_the_sphinx',
    ])
    expect(CHOICES.find((c) => c.id === 'prop_hunt')?.host).toBe('leela')
  })

  it('offers one with no round all seven types, from the house, and nothing a round adds', () => {
    const any = CHOICES.find((c) => c.id === NO_ROUND)
    expect([any?.kind, any?.label, any?.hint, any?.host]).toEqual([
      'question',
      'Not sure where it fits',
      'Any question. Reldo picks its round.',
      'house',
    ])
    expect(any?.types).toEqual([
      'multiple_choice',
      'free_text',
      'closest_number',
      'number_slider',
      'pick_all_that_apply',
      'ordering',
      'matching',
    ])
    expect([any?.quote, any?.prompt, any?.wikiOnly, any?.pictureItem, any?.editor]).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    ])
  })

  it('finds the one a stored suggestion was written under', () => {
    expect(choiceOf('question', QUESTION)?.id).toBe('odd_one_out')
    const { mode: _mode, ...unplaced } = QUESTION
    expect(choiceOf('question', unplaced)?.id).toBe(NO_ROUND)
    expect(hostOf('question', unplaced)).toBe('house')
    expect(questionPreview(unplaced).mode).toBe('custom')
    expect(choiceOf('item', { name: 'Abyssal whip' })?.id).toBe('item')
  })

  it("shows a random event's own NPC, and the round's host otherwise", () => {
    expect(hostOf('question', { ...QUESTION, mode: 'random_event', random_event: 'thurgo' })).toBe(
      'thurgo',
    )
    expect(hostOf('question', { ...QUESTION, mode: 'random_event' })).toBe('sandwich_lady')
    expect(hostOf('item', { name: 'Abyssal whip' })).toBe('grand_exchange_clerk')
  })
})

describe('a place on the map', () => {
  const place: QuestionContent = {
    type: 'map_pin',
    mode: 'mark_the_map',
    payload: {
      prompt: 'Where is Falador?',
      targets: [{ name: 'Falador', min_x: 2940, max_x: 3060, min_y: 3310, max_y: 3400 }],
      reach: 150,
    },
  }

  it('is offered only for a map round, never to a question with no round', () => {
    expect(roundsFor('map_pin').map((choice) => choice.id)).toEqual([
      'mark_the_map',
      'minimap_guesser',
      'lost_in_gielinor',
    ])
    expect(roundsFor('map_pin', true).map((choice) => choice.id)).toEqual(['kgp_recon'])
    expect(CHOICES.find((c) => c.id === NO_ROUND)?.types).not.toContain('map_pin')
    expect(CHOICES.find((c) => c.id === 'random_event')?.types).not.toContain('map_pin')
  })

  it('lists a recon photo by its place, since every one asks the same', () => {
    const photo: QuestionContent = {
      type: 'map_pin',
      mode: 'kgp_recon',
      payload: {
        prompt: 'Where was this photo taken?',
        targets: [{ name: 'Varrock square', min_x: 3200, max_x: 3230, min_y: 3420, max_y: 3440 }],
        screenshot: 'screenshot:suggested-ab',
        width: 800,
        height: 450,
      },
    }
    expect(summary({ kind: 'question', content: photo })).toBe('Varrock square')
    expect(summary({ kind: 'question', content: place })).toBe('Where is Falador?')
  })

  it('reads in the queue as its name, box and reach', () => {
    expect(answerOf({ kind: 'question', content: place })).toBe(
      'Falador (x 2940–3060, y 3310–3400, reach 150)',
    )
  })

  it('previews one pin and no target', () => {
    expect(questionPreview(place).view).toEqual({ prompt: 'Where is Falador?', pins: 1 })
  })

  it('prints its prompt on the stage before its round ships', () => {
    expect(JSON.stringify(stemLines('mark_the_map', questionPreview(place).view))).toContain(
      'Where is Falador?',
    )
  })

  it('asks after the name it was given', () => {
    expect(placePrompt('  Falador ')).toBe('Where is Falador?')
    expect(placePrompt(' ')).toBe('')
    expect(placeProblem(' ')).toBe('Required: the place’s name.')
    expect(placeProblem('Falador')).toBeNull()
  })
})

describe('the checks', () => {
  it('want a wiki page on the OSRS Wiki', () => {
    expect(wikiProblem('')).toMatch(/Required/)
    expect(wikiProblem('https://example.com/w/Bob')).toMatch(/oldschool\.runescape\.wiki/)
    expect(wikiProblem('https://oldschool.runescape.wiki/w/Bob')).toBeNull()
    expect(wikiProblem(`https://oldschool.runescape.wiki/w/${'a'.repeat(300)}`)).toMatch(/At most/)
  })

  it('hold a credit to the name rules', () => {
    expect(creditProblem('  ')).toMatch(/Required/)
    expect(creditProblem('Zezima<b>')).not.toBeNull()
    expect(creditProblem('x'.repeat(25))).not.toBeNull()
    expect(creditProblem('AFK Fisher')).toBeNull()
  })

  it('want an item name and no more', () => {
    expect(itemProblem({ name: ' ' })).toMatch(/Required/)
    expect(itemProblem({ name: 'x'.repeat(81) })).toMatch(/At most 80/)
    expect(itemProblem({ name: 'Abyssal whip' })).toBeNull()
    const roster = [{ id: 4151, name: 'Abyssal whip' }]
    expect(itemProblem({ name: ' ABYSSAL whip' }, roster)).toBe('Already in the game.')
    expect(itemProblem({ name: 'Abyssal dagger' }, roster)).toBeNull()
  })

  it('want an NPC’s name the game does not ask about yet', () => {
    expect(npcNameProblem(' ')).toMatch(/Required/)
    expect(npcNameProblem('x'.repeat(81))).toMatch(/At most 80/)
    expect(npcNameProblem(' VORKATH ', ['Vorkath'])).toBe('Already in the game.')
    expect(npcNameProblem('Araxxor', ['Vorkath'])).toBeNull()
  })

  it('preview a Who’s That NPC? as its prompt, with no picture or list yet', () => {
    const content = {
      type: 'pick_from_list' as const,
      mode: 'whos_that_npc',
      payload: { prompt: "Who's that NPC?", subject: { name: 'Araxxor' } },
    }
    const open = questionPreview(content)
    expect([open.type, open.mode, open.view, open.picture]).toEqual([
      'pick_from_list',
      'whos_that_npc',
      { prompt: "Who's that NPC?" },
      null,
    ])
    expect(answerOf({ kind: 'question', content })).toBe('Araxxor')
  })

  it('take a picture item or none, up to an item name long', () => {
    expect(pictureItemProblem('  ')).toBeNull()
    expect(pictureItemProblem('Dragon warhammer')).toBeNull()
    expect(pictureItemProblem('x'.repeat(81))).toMatch(/At most 80/)
  })
})

describe('a verse', () => {
  it('may not hold its item’s name, whatever the case or punctuation', () => {
    expect(verseProblem('My ABYSSAL, whip cracks.', 'Abyssal whip')).toMatch(/gives its answer/)
    expect(verseProblem('From Ahrims hood I sing.', "Ahrim's hood")).toMatch(/gives its answer/)
    expect(verseProblem('A whip that cracks.', 'Abyssal whip')).toBeNull()
    expect(verseProblem(' ', 'Abyssal whip')).toMatch(/Required/)
    expect(verseProblem('la'.repeat(VERSE_MAX), 'Abyssal whip')).toMatch(/At most/)
  })

  it('is about a plain item', () => {
    expect(verseItemProblem('Dragon scimitar (or)')).toMatch(/plain item/)
    expect(verseItemProblem(' ')).toMatch(/Required/)
    expect(verseItemProblem('Dragon scimitar')).toBeNull()
    expect(
      plainItems([
        { id: 1, name: 'Prayer potion(4)' },
        { id: 2, name: 'Coal' },
      ]),
    ).toEqual([{ id: 2, name: 'Coal' }])
  })

  it('links its item’s wiki page', () => {
    expect(itemPage(" Ahrim's hood ")).toBe("https://oldschool.runescape.wiki/w/Ahrim's_hood")
    expect(itemPage(' ')).toBe('')
  })
})

describe('the queue', () => {
  it('says each kind in one line, with its answer', () => {
    expect(summary({ kind: 'question', content: QUESTION })).toBe('Dharok, Hazelmere')
    expect(answerOf({ kind: 'question', content: QUESTION })).toBe('Hazelmere')
    const npc = {
      ...QUESTION,
      mode: 'whos_that_npc',
      type: 'pick_from_list' as const,
      payload: { prompt: "Who's that NPC?", subject: { name: 'Zulrah' } },
    }
    expect(summary({ kind: 'question', content: npc })).toBe('Zulrah')
    const render = {
      ...QUESTION,
      mode: 'whos_that_npc',
      payload: { prompt: "Who's that NPC?", options: ['Vorkath', 'Zulrah'], answer_index: 1 },
    }
    expect(summary({ kind: 'question', content: render })).toBe('Zulrah')
    const odd = {
      ...QUESTION,
      mode: 'odd_one_out',
      payload: {
        prompt: "Which one doesn't belong?",
        options: ['Guthan', 'Dharok', 'Hazelmere'],
        answer_index: 2,
      },
    }
    expect(summary({ kind: 'question', content: odd })).toBe('Guthan, Dharok, Hazelmere')
    const said = {
      ...QUESTION,
      mode: 'who_said_that',
      payload: { ...QUESTION.payload, prompt: 'Who said that?', quote: 'Ow!' },
    }
    expect(summary({ kind: 'question', content: said })).toBe('Who said that? “Ow!”')
    const typed = {
      ...QUESTION,
      type: 'free_text' as const,
      payload: { prompt: 'p', accepted: ['Jad', 'TzTok-Jad'] },
    }
    expect(answerOf({ kind: 'question', content: typed })).toBe('Jad / TzTok-Jad')
    const number = {
      ...QUESTION,
      type: 'closest_number' as const,
      payload: { prompt: 'p', answer: 99, unit: 'gp' },
    }
    expect(answerOf({ kind: 'question', content: number })).toBe('99 gp')
    const payload = {
      prompt: 'p',
      options: ['Imp', 'Gargoyle', 'Hellhound'],
      answer_indices: [0, 2],
    }
    const pickAll = { ...QUESTION, type: 'pick_all_that_apply' as const, payload }
    expect(answerOf({ kind: 'question', content: pickAll })).toBe('Imp / Hellhound')
  })

  it('says when the limit frees up, and names an export by its day', () => {
    const now = Date.parse('2026-10-04T12:00:00Z')
    expect(retryIn('2026-10-04T12:22:10Z', now)).toBe('in 23 minutes')
    expect(retryIn('2026-10-04T12:00:10Z', now)).toBe('in 1 minute')
    expect(retryIn(null, now)).toBe('later')
    expect(exportName('approved', new Date(now))).toBe('suggestions-approved-2026-10-04.json')
  })
})

describe('a question’s round', () => {
  const { mode: _mode, ...unplaced } = QUESTION

  it('is wanted before a question is approved, and never of an item', () => {
    expect(hasRound('question', unplaced)).toBe(false)
    expect(hasRound('question', QUESTION)).toBe(true)
    expect(hasRound('item', { name: 'Abyssal whip' })).toBe(true)
  })

  it('is picked from the rounds whose editor offers its type', () => {
    for (const type of ['free_text', 'ordering'] as const) {
      const suggesting = CHOICES.filter((c) => SUGGESTIBLE.get(c.id)?.types.includes(type))
      expect(suggesting.length, type).toBeGreaterThan(1)
      expect(roundsFor(type).map((c) => c.id)).toEqual(suggesting.map((c) => c.id))
    }
    expect(roundsFor('free_text').map((c) => c.id)).toContain('random_event')
    expect(roundsFor('ordering').map((c) => c.id)).toContain('sort_it_out')
    expect(roundsFor('ordering').map((c) => c.id)).not.toContain('drop_table')
    expect(roundsFor('pick_from_list').map((c) => c.id)).toEqual([
      'whos_that_npc',
      'forgetful_bard',
      'riddles_of_the_sphinx',
    ])
    expect(roundsFor('multiple_choice').map((c) => c.id)).not.toContain(NO_ROUND)
  })

  it('keeps an NPC only for a random event, and leaves the rest as written', () => {
    const event = { ...QUESTION, mode: 'random_event', random_event: 'bob' }
    expect(placedIn(unplaced, 'bestiary')).toEqual({ ...QUESTION, mode: 'bestiary' })
    expect(placedIn(event, 'random_event')).toEqual(event)
    expect(placedIn(event, 'bestiary')).toEqual({ ...QUESTION, mode: 'bestiary' })
    expect(placedIn(QUESTION, NO_ROUND)).toEqual(unplaced)
  })

  it('keeps an intro only for a round that shows one, whose editor can take it out', () => {
    const intro = { ...QUESTION.payload, intro: 'Gems, adventurer!' }
    const event = { ...QUESTION, mode: 'random_event', random_event: 'bob', payload: intro }
    expect(placedIn(event, 'random_event')).toEqual(event)
    expect(placedIn(event, 'tales_of_gielinor')).toEqual({ ...QUESTION, mode: 'tales_of_gielinor' })
    expect(placedIn(event, NO_ROUND)).toEqual(unplaced)
  })
})

describe('what the game already asks', () => {
  it('lists the packs beside every round’s card, and nothing beside the item or no round', () => {
    for (const choice of CHOICES) {
      const listed = choice.kind === 'question' && choice.id !== NO_ROUND
      expect(existingMode(choice)).toBe(listed ? choice.id : null)
    }
  })

  it('puts random events in roster order, the picked NPC’s first, each NPC’s in pack order', () => {
    const rows = [
      { id: 'r1', label: 'Reldo 1', random_event: 'reldo' },
      { id: 'x', label: 'Newer', random_event: 'someone_new' },
      { id: 'b1', label: 'Bob 1', random_event: 'bob' },
      { id: 'r2', label: 'Reldo 2', random_event: 'reldo' },
      { id: 's1', label: 'Sandwich 1', random_event: 'sandwich_lady' },
    ]
    const ids = (npc: string) => inGameOrder(rows, npc).map((row) => row.id)
    expect(ids('')).toEqual(['s1', 'b1', 'r1', 'r2', 'x'])
    expect(ids('reldo')).toEqual(['r1', 'r2', 's1', 'b1', 'x'])
    const plain = [
      { id: 'b', label: 'B' },
      { id: 'a', label: 'A' },
    ]
    expect(inGameOrder(plain, 'reldo')).toEqual(plain)
  })
})

describe('similar questions', () => {
  const asked: QuestionContent = {
    type: 'multiple_choice',
    mode: 'bestiary',
    payload: { prompt: 'Which boss?', options: ['Kalphite Queen', 'Zulrah'], answer_index: 0 },
  }

  it('asks again only when the prompt or the answer changes', () => {
    const key = similarKey(asked)
    expect(key).not.toBeNull()
    expect(similarKey({ ...asked, payload: { ...asked.payload, explanation: 'Why' } })).toBe(key)
    expect(similarKey({ ...asked, payload: { ...asked.payload, prompt: 'Which?' } })).not.toBe(key)
    expect(similarKey({ ...asked, payload: { ...asked.payload, answer_index: 1 } })).not.toBe(key)
  })

  it('waits for both a prompt and an answer', () => {
    expect(similarKey({ ...asked, payload: { ...asked.payload, prompt: ' ' } })).toBeNull()
    expect(
      similarKey({ ...asked, payload: { ...asked.payload, options: ['', 'Zulrah'] } }),
    ).toBeNull()
  })

  it('names an Odd One Out by its options', () => {
    const odd = { ...asked, mode: 'odd_one_out' }
    expect(matchLine(odd)).toBe('Kalphite Queen, Zulrah')
    expect(
      similarKey({ ...odd, payload: { ...odd.payload, options: ['Kalphite Queen', 'Vorkath'] } }),
    ).not.toBe(similarKey(odd))
  })
})

describe('steps in the suggestion form', () => {
  it('offers Extras only to question choices that have an intro, picture item, or explanation', () => {
    const withoutExtras = CHOICES.filter((c) => !hasExtras(c)).map((c) => c.id)
    expect(withoutExtras).toEqual([
      'item',
      'guess_examine',
      'whos_that_npc',
      'forgetful_bard',
      'mark_the_map',
      'prop_hunt',
      'riddles_of_the_sphinx',
      'lost_in_gielinor',
    ])
  })

  it('asks a picture pin for no source: its own screenshot proves it', () => {
    const prop = CHOICES.find((c) => c.id === 'prop_hunt')!
    expect(prop.editor).toBe('picture')
    const steps = stepsFor({
      choice: prop,
      attempted: true,
      questionDone: true,
      difficultyDone: true,
      extrasFilled: false,
      extrasValid: true,
      sourceDone: false,
      creditDone: true,
    })
    expect(steps.map((step) => [step.title, step.missing])).toEqual([
      ['Question', false],
      ['Difficulty', false],
      ['Credit', false],
    ])
  })

  it('builds five steps for a round with extras, and marks missing steps on submit', () => {
    const dropTable = CHOICES.find((c) => c.id === 'drop_table')!
    expect(
      stepsFor({
        choice: dropTable,
        attempted: false,
        questionDone: true,
        difficultyDone: true,
        extrasFilled: false,
        extrasValid: true,
        sourceDone: false,
        creditDone: true,
      }),
    ).toEqual([
      { title: 'Question', done: true, missing: false },
      { title: 'Difficulty', done: true, missing: false },
      { title: 'Extras', optional: true, done: false, missing: false },
      { title: 'Source', done: false, missing: false },
      { title: 'Credit', done: true, missing: false },
    ])
    expect(
      stepsFor({
        choice: dropTable,
        attempted: true,
        questionDone: true,
        difficultyDone: false,
        extrasFilled: true,
        extrasValid: true,
        sourceDone: false,
        creditDone: true,
      }),
    ).toEqual([
      { title: 'Question', done: true, missing: false },
      { title: 'Difficulty', done: false, missing: true },
      { title: 'Extras', optional: true, done: true, missing: false },
      { title: 'Source', done: false, missing: true },
      { title: 'Credit', done: true, missing: false },
    ])
  })

  it('builds four steps for a wiki-only round without extras, and two for an item', () => {
    const examine = CHOICES.find((c) => c.id === 'guess_examine')!
    expect(
      stepsFor({
        choice: examine,
        attempted: true,
        questionDone: false,
        difficultyDone: false,
        extrasFilled: false,
        extrasValid: true,
        sourceDone: true,
        creditDone: false,
      }),
    ).toEqual([
      { title: 'Question', done: false, missing: true },
      { title: 'Difficulty', done: false, missing: true },
      { title: 'Wiki page', done: true, missing: false },
      { title: 'Credit', done: false, missing: true },
    ])

    const event = CHOICES.find((c) => c.id === 'random_event')!
    expect(
      stepsFor({
        choice: event,
        attempted: false,
        questionDone: true,
        extrasFilled: false,
        extrasValid: true,
        sourceDone: true,
        creditDone: true,
      }),
    ).toEqual([
      { title: 'Question', done: true, missing: false },
      { title: 'Extras', optional: true, done: false, missing: false },
      { title: 'Source', done: true, missing: false },
      { title: 'Credit', done: true, missing: false },
    ])

    const item = CHOICES.find((c) => c.id === 'item')!
    expect(
      stepsFor({
        choice: item,
        attempted: true,
        questionDone: false,
        extrasFilled: false,
        extrasValid: true,
        sourceDone: false,
        creditDone: true,
      }),
    ).toEqual([
      { title: 'Item', done: false, missing: true },
      { title: 'Credit', done: true, missing: false },
    ])
  })
})
