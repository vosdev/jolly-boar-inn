/** What a suggestion is checked against before it is sent, and how the queue reads one. */

import { beforeEach, describe, expect, it } from 'vitest'

import { savePastGame } from './history'
import {
  CHOICES,
  answerOf,
  choiceOf,
  creditProblem,
  existingMode,
  exportName,
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
  summary,
  wikiProblem,
  type QuestionContent,
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
    expect(CHOICES.map((choice) => choice.id)).toEqual([
      'item',
      'random_event',
      'guess_examine',
      'bestiary',
      'drop_table',
      'odd_one_out',
      'minigame_madness',
      'who_said_that',
      'know_your_content_creator',
      'whos_that_npc',
      'sort_it_out',
      'release_order',
      'no_round',
    ])
    expect(CHOICES.find((c) => c.id === 'odd_one_out')?.types).toEqual(['multiple_choice'])
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
    ])
    const npc = CHOICES.find((c) => c.id === 'whos_that_npc')
    expect([npc?.types, npc?.host, npc?.prompt, npc?.named]).toEqual([
      ['pick_from_list'],
      'postie_pete',
      { text: "Who's that NPC?", fixed: true },
      true,
    ])
    expect(CHOICES.filter((c) => c.options !== undefined).map((c) => c.id)).toEqual([
      'guess_examine',
    ])
    expect(CHOICES.find((c) => c.id === 'bestiary')?.types).toEqual([
      'multiple_choice',
      'free_text',
      'closest_number',
      'number_slider',
      'pick_all_that_apply',
      'ordering',
      'matching',
    ])
    expect(CHOICES.find((c) => c.id === 'drop_table')?.types).toEqual([
      'multiple_choice',
      'free_text',
      'closest_number',
      'number_slider',
      'pick_all_that_apply',
      'matching',
    ])
    expect(CHOICES.find((c) => c.id === 'minigame_madness')?.types).toEqual([
      'multiple_choice',
      'free_text',
      'closest_number',
      'number_slider',
      'pick_all_that_apply',
      'ordering',
      'matching',
    ])
    expect(CHOICES.find((c) => c.id === 'know_your_content_creator')?.types).toEqual([
      'multiple_choice',
      'closest_number',
      'number_slider',
      'pick_all_that_apply',
    ])
    const sort = CHOICES.find((c) => c.id === 'sort_it_out')
    expect(sort?.types).toEqual(['ordering'])
    expect(sort?.host).toBe('historian_minas')
    expect(sort?.hint).toBe('Something worth putting in order.')
    expect(CHOICES.filter((c) => c.pictureItem).map((c) => c.id)).toEqual([
      'drop_table',
      'minigame_madness',
    ])
    const quoting = CHOICES.filter((c) => c.quote).map((c) => c.id)
    expect(quoting).toEqual(['who_said_that', 'know_your_content_creator'])
    const silent = CHOICES.filter((c) => c.explanation === false).map((c) => c.id)
    expect(silent).toEqual(['guess_examine'])
    const release = CHOICES.find((c) => c.id === 'release_order')
    expect(release?.types).toEqual(['ordering'])
    expect(release?.host).toBe('aris')
    expect(CHOICES.find((c) => c.id === 'random_event')?.types).toEqual([
      'multiple_choice',
      'free_text',
      'closest_number',
      'number_slider',
      'pick_all_that_apply',
      'ordering',
      'matching',
    ])
  })

  it('offers one with no round all seven types, from the innkeeper, and nothing a round adds', () => {
    const any = CHOICES.find((c) => c.id === NO_ROUND)
    expect([any?.kind, any?.label, any?.hint, any?.host]).toEqual([
      'question',
      'Not sure where it fits',
      'Any question. The innkeeper picks its round.',
      'innkeeper',
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
    expect([any?.quote, any?.prompt, any?.wikiOnly, any?.pictureItem, any?.named]).toEqual([
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
    expect(hostOf('question', unplaced)).toBe('innkeeper')
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

  it('preview a Who’s That NPC? as its prompt and the list, with no picture', () => {
    const content = {
      type: 'pick_from_list' as const,
      mode: 'whos_that_npc',
      payload: { prompt: "Who's that NPC?", subject: { name: 'Araxxor' } },
    }
    const open = questionPreview(content)
    expect([open.type, open.mode, open.view, open.picture]).toEqual([
      'pick_from_list',
      'whos_that_npc',
      { prompt: "Who's that NPC?", vocab: 'npcs' },
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

describe('the queue', () => {
  it('says each kind in one line, with its answer', () => {
    expect(summary({ kind: 'question', content: QUESTION })).toBe('Which is not a Barrows brother?')
    expect(answerOf({ kind: 'question', content: QUESTION })).toBe('Hazelmere')
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
    expect(roundsFor('free_text').map((c) => c.id)).toEqual([
      'random_event',
      'bestiary',
      'drop_table',
      'minigame_madness',
    ])
    expect(roundsFor('ordering').map((c) => c.id)).toEqual([
      'random_event',
      'bestiary',
      'minigame_madness',
      'sort_it_out',
      'release_order',
    ])
    expect(roundsFor('pick_from_list').map((c) => c.id)).toEqual(['whos_that_npc'])
    expect(roundsFor('multiple_choice').map((c) => c.id)).not.toContain(NO_ROUND)
  })

  it('keeps an NPC only for a random event, and leaves the rest as written', () => {
    const event = { ...QUESTION, mode: 'random_event', random_event: 'bob' }
    expect(placedIn(unplaced, 'bestiary')).toEqual({ ...QUESTION, mode: 'bestiary' })
    expect(placedIn(event, 'random_event')).toEqual(event)
    expect(placedIn(event, 'bestiary')).toEqual({ ...QUESTION, mode: 'bestiary' })
    expect(placedIn(QUESTION, NO_ROUND)).toEqual(unplaced)
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
