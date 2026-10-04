/** What a suggestion is checked against before it is sent, and how the queue reads one. */

import { beforeEach, describe, expect, it } from 'vitest'

import { savePastGame } from './history'
import {
  CHOICES,
  answerOf,
  choiceOf,
  creditProblem,
  examineProblems,
  exportName,
  itemProblem,
  maySuggest,
  retryIn,
  summary,
  wikiProblem,
} from './suggestions'

const QUESTION = {
  type: 'multiple_choice' as const,
  mode: 'odd_one_out',
  wiki: 'https://oldschool.runescape.wiki/w/Barrows_Brothers',
  payload: { prompt: 'Which is not a Barrows brother?', options: ['Dharok', 'Hazelmere'], answer_index: 1 },
}

beforeEach(() => localStorage.clear())

describe('who may suggest', () => {
  it('is a browser that has finished a game', () => {
    expect(maySuggest()).toBe(false)
    savePastGame({ code: 'ABYSSAL', finishedAt: '2026-10-01T20:05:00Z', standings: [], youId: null })
    expect(maySuggest()).toBe(true)
  })
})

describe('the choices', () => {
  it('are an examine, an item, an NPC question and the four-button rounds still being built', () => {
    expect(CHOICES.map((choice) => choice.id)).toEqual([
      'examine',
      'item',
      'random_event',
      'bestiary',
      'drop_table',
      'odd_one_out',
      'who_said_that',
      'know_your_content_creator',
    ])
    expect(CHOICES.find((c) => c.id === 'odd_one_out')?.types).toEqual(['multiple_choice'])
    expect(CHOICES.find((c) => c.id === 'random_event')?.types).toEqual([
      'multiple_choice',
      'free_text',
      'closest_number',
    ])
  })

  it('finds the one a stored suggestion was written under', () => {
    expect(choiceOf('question', QUESTION)?.id).toBe('odd_one_out')
    expect(choiceOf('item', { name: 'Abyssal whip' })?.id).toBe('item')
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

  it('want an examine line, its name and its page', () => {
    expect(examineProblems({ name: '', prompt: '', wiki: '' })).toEqual({
      name: expect.stringMatching(/Required/),
      prompt: expect.stringMatching(/Required/),
      wiki: expect.stringMatching(/Required/),
    })
    const good = { name: 'Cabbage', prompt: 'Yuck.', wiki: 'https://oldschool.runescape.wiki/w/Cabbage' }
    expect(examineProblems(good)).toEqual({ name: null, prompt: null, wiki: null })
    expect(examineProblems({ ...good, prompt: 'x'.repeat(301) }).prompt).toMatch(/At most 300/)
  })

  it('want an item name and no more', () => {
    expect(itemProblem({ name: ' ' })).toMatch(/Required/)
    expect(itemProblem({ name: 'x'.repeat(81) })).toMatch(/At most 80/)
    expect(itemProblem({ name: 'Abyssal whip' })).toBeNull()
    const roster = [{ id: 4151, name: 'Abyssal whip' }]
    expect(itemProblem({ name: ' ABYSSAL whip' }, roster)).toBe('Already in the game.')
    expect(itemProblem({ name: 'Abyssal dagger' }, roster)).toBeNull()
  })
})

describe('the queue', () => {
  it('says each kind in one line, with its answer', () => {
    expect(summary({ kind: 'question', content: QUESTION })).toBe('Which is not a Barrows brother?')
    expect(answerOf({ kind: 'question', content: QUESTION })).toBe('Hazelmere')
    const examine = { name: 'Cabbage', prompt: 'Yuck.', wiki: '' }
    expect(summary({ kind: 'examine', content: examine })).toBe('“Yuck.” · Cabbage')
    const typed = { ...QUESTION, type: 'free_text' as const, payload: { prompt: 'p', accepted: ['Jad', 'TzTok-Jad'] } }
    expect(answerOf({ kind: 'question', content: typed })).toBe('Jad / TzTok-Jad')
    const number = { ...QUESTION, type: 'closest_number' as const, payload: { prompt: 'p', answer: 99, unit: 'gp' } }
    expect(answerOf({ kind: 'question', content: number })).toBe('99 gp')
  })

  it('says when the limit frees up, and names an export by its day', () => {
    const now = Date.parse('2026-10-04T12:00:00Z')
    expect(retryIn('2026-10-04T12:22:10Z', now)).toBe('in 23 minutes')
    expect(retryIn('2026-10-04T12:00:10Z', now)).toBe('in 1 minute')
    expect(retryIn(null, now)).toBe('later')
    expect(exportName('approved', new Date(now))).toBe('suggestions-approved-2026-10-04.json')
  })
})
