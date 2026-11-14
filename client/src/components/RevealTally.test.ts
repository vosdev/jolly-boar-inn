/**
 * The lines under a reveal. The count always; then, under "Got it wrong", a line per
 * group of answers that were not right, with its count, and its names only when the host
 * asked for them; then who did not answer, muted. What a group is depends on the type:
 * the option for a pick of one, the typed form for free text, the entry for a list, the
 * closeness for a number, right picks for pick all, entries in place for ordering,
 * fields right for matching.
 */

import { render, waitFor } from '@testing-library/svelte'
import { describe, expect, it, vi } from 'vitest'

import type { PlayerResult } from '../lib/protocol'
import type { TeamId } from '../lib/teams'
import RevealTally from './RevealTally.svelte'

vi.mock('../lib/vocab', () => ({
  loadVocab: () =>
    Promise.resolve({
      vocab: 'npcs',
      version: '1',
      entries: [
        { id: 1, name: 'Hans' },
        { id: 2, name: 'Bob' },
      ],
    }),
}))

const NAMES: Record<string, string> = {
  a: 'Zezima',
  b: 'Woox',
  c: 'Lynx',
  d: 'Dorn',
  e: 'Alkan',
  f: 'Tehnoobshow',
  g: 'Mod Ash',
  h: 'B0aty',
  i: 'Settled',
  j: 'Odablock',
  k: 'Durial321',
}
const nameOf = (id: string) => NAMES[id] ?? null

const right = (value: unknown = 0, points = 900): PlayerResult => ({
  value,
  correct: true,
  credit: 1,
  points,
})
const wrong = (value: unknown = 1): PlayerResult => ({
  value,
  correct: false,
  credit: 0,
  points: 0,
})
const partly = (credit: number, value: unknown = 1): PlayerResult => ({
  value,
  correct: false,
  credit,
  points: Math.round(900 * credit),
})

const text = (element: Element | null | undefined) =>
  element?.textContent?.replace(/\s+/g, ' ').trim()
const lines = (container: HTMLElement) => [...container.querySelectorAll('.group')].map(text)
const count = (container: HTMLElement) => text(container.querySelector('.count'))

const OPTIONS = { options: ['Abyssal whip', 'Granite maul', 'Dragon scimitar', 'Rune 2h sword'] }

function draw(
  results: Record<string, PlayerResult>,
  {
    showNames = true,
    youId = 'a',
    type = 'multiple_choice',
    reveal = OPTIONS as Record<string, unknown>,
    unanswered = [] as string[],
    panel = false,
  } = {},
) {
  return render(RevealTally, { type, reveal, results, unanswered, nameOf, youId, showNames, panel })
}

/** A pick-all answer graded as the server does: right picks over right or picked. */
const picks = (answer: number[], value: number[]): PlayerResult => {
  const hits = value.filter((index) => answer.includes(index)).length
  const credit = hits / new Set([...answer, ...value]).size
  return { value, correct: credit === 1, credit, points: Math.round(900 * credit) }
}

describe('RevealTally', () => {
  it('counts who got it right out of who answered', () => {
    const { container } = draw({ a: right(), b: wrong(), c: right() }, { showNames: false })
    expect(count(container)).toBe('2 of 3 got it right')
  })

  it('groups a pick of one by its option, the biggest first, with its gem and names', () => {
    const { container } = draw({
      a: wrong(1),
      b: wrong(2),
      c: right(0),
      d: wrong(1),
      e: wrong(3),
      f: wrong(3),
    })
    expect(text(container.querySelector('.head'))).toBe('Got it wrong')
    expect(lines(container)).toEqual([
      'Granite maul (2): Zezima (you), Dorn',
      'Rune 2h sword (2): Alkan, Tehnoobshow',
      'Dragon scimitar (1): Woox',
    ])
    const chips = [...container.querySelectorAll('.group .chip')].map((chip) => chip.classList[1])
    expect(chips).toEqual(['emerald', 'red-topaz', 'ruby'])
  })

  it('keeps the counts and drops the names when the host turned them off', () => {
    const { container } = draw({ a: wrong(1), b: wrong(2), c: wrong(1) }, { showNames: false })
    expect(lines(container)).toEqual(['Granite maul (2)', 'Dragon scimitar (1)'])
    expect(container.textContent).not.toContain('Zezima')
  })

  it('names eight at most, and you whatever your place', () => {
    const everyone = Object.fromEntries(Object.keys(NAMES).map((id) => [id, wrong(1)]))
    const { container } = draw(everyone, { youId: 'a' })
    expect(lines(container)).toEqual([
      'Granite maul (11): Zezima (you), Alkan, B0aty, Dorn, Durial321, Lynx, Mod Ash, Odablock and 3 more',
    ])
    const last = draw(everyone, { youId: 'b' }).container
    expect(lines(last)[0]).toContain('Woox (you),')
  })

  it('groups price guesses by closeness, written as coins, and a more-or-less item by name', () => {
    const prices = draw(
      {
        a: { value: 1_650_000, correct: false, credit: 0.5, points: 300 },
        b: { value: 9_000_000, correct: false, credit: 0, points: 0 },
      },
      { type: 'price_is_right', reveal: { value: 1_200_000, min: 900_000, max: 2_000_000 } },
    ).container
    const [close, further] = lines(prices)
    expect(close).toMatch(/^Close \(1\): Zezima \(you\)/)
    expect(close).toContain('1.6M gp')
    expect(further).toMatch(/^Further off \(1\)/)
    const items = draw(
      { a: wrong(1) },
      {
        type: 'more_less',
        reveal: {
          options: [{ subject: { name: 'Abyssal whip' } }, { subject: { name: 'Bones' } }],
        },
      },
    ).container
    expect(lines(items)).toEqual(['Bones (1): Zezima (you)'])
    expect(items.querySelector('.chip')).toBeNull()
  })

  it('groups slider guesses by closeness, written with their unit', () => {
    const { container } = draw(
      {
        a: { value: 1_500, correct: false, credit: 0.6, points: 480 },
        b: { value: 90, correct: false, credit: 0, points: 0 },
      },
      {
        type: 'number_slider',
        reveal: { answer: 2_000, min: 100, max: 10_000, scale: 'log', unit: 'hp' },
      },
    )
    const [close, further] = lines(container)
    expect(close).toMatch(/^Close \(1\): Zezima \(you\)/)
    expect(close).toContain('1,500 hp')
    expect(further).toMatch(/^Further off \(1\)/)
  })

  it('groups typed answers as the server grades them, said as the first typed it', () => {
    const { container } = draw(
      {
        a: wrong('Jadd'),
        b: wrong('jadd!'),
        c: wrong('Zuk'),
        d: wrong('zuk'),
        e: wrong('Zulrah'),
        f: wrong('Vorkath'),
        g: wrong('Olm'),
        h: right('Jad'),
      },
      { type: 'free_text', reveal: { accepted: ['Jad'] } },
    )
    expect(lines(container)).toEqual([
      '“Jadd” (2): Zezima (you), Woox',
      '“Zuk” (2): Dorn, Lynx',
      '“Zulrah” (1): Alkan',
      'Something else (2): Mod Ash, Tehnoobshow',
    ])
  })

  it('draws a fourth typed answer as itself rather than as something else', () => {
    const { container } = draw(
      { a: wrong('a'), b: wrong('b'), c: wrong('c'), d: wrong('d') },
      { type: 'free_text', showNames: false },
    )
    expect(lines(container)).toEqual(['“a” (1)', '“b” (1)', '“c” (1)', '“d” (1)'])
  })

  it('names a list pick by its entry', async () => {
    const { container } = draw(
      { a: wrong(2), b: right(1) },
      { type: 'pick_from_list', reveal: { vocab: 'npcs', answer_id: 1 } },
    )
    await waitFor(() => expect(lines(container)).toEqual(['Bob (1): Zezima (you)']))
  })

  it('groups closest-number guesses by whether they scored, with each guess', () => {
    const { container } = draw(
      {
        a: right(100, 1000),
        b: partly(0.7, 98),
        c: partly(0.25, 110),
        d: wrong(5000),
        e: wrong(300),
      },
      { type: 'closest_number', reveal: { answer: 100, within: 10, unit: 'kc' } },
    )
    expect(count(container)).toBe('1 of 5 guessed it exactly')
    expect(lines(container)).toEqual([
      'Close (2): Lynx 110 kc · Woox 98 kc',
      'Further off (2): Alkan 300 kc · Dorn 5,000 kc',
    ])
  })

  it('groups a pick-all answer by its right picks, with picks set', () => {
    const answer = [0, 1, 2, 3]
    const { container } = draw(
      {
        a: picks(answer, [0, 1, 4, 5]),
        b: picks(answer, [0, 1, 2, 3]),
        c: picks(answer, [0, 1, 2, 4]),
        d: picks(answer, [1, 2, 4, 5]),
        e: picks(answer, [0, 1, 2, 5]),
      },
      {
        showNames: false,
        type: 'pick_all_that_apply',
        reveal: { options: ['a', 'b', 'c', 'd', 'e', 'f'], answer_indices: answer, picks: 4 },
      },
    )
    expect(count(container)).toBe('1 of 5 got it right')
    expect(lines(container)).toEqual(['3 of 4 right (2)', '2 of 4 right (2)'])
  })

  it('says how many a pick-all answer got wrong when any number could be picked', () => {
    const answer = [0, 2]
    const { container } = draw(
      {
        a: picks(answer, [0, 1, 2]),
        b: picks(answer, [0]),
        c: picks(answer, [0, 1, 2, 3]),
        d: picks(answer, [1, 3]),
      },
      {
        type: 'pick_all_that_apply',
        reveal: { options: ['a', 'b', 'c', 'd'], answer_indices: answer },
      },
    )
    expect(lines(container)).toEqual([
      '2 of 2 right, 1 wrong (1): Zezima (you)',
      '2 of 2 right, 2 wrong (1): Lynx',
      '1 of 2 right (1): Woox',
      'None right (1): Dorn',
    ])
  })

  it('groups an ordering answer by its entries in place, read off its credit', () => {
    const entries = ['a', 'b', 'c', 'd', 'e'].map((text) => ({ text }))
    const { container } = draw(
      { a: partly(0.6), b: right(), c: partly(0.6), d: partly(0.2), e: wrong() },
      { type: 'ordering', reveal: { entries, answer: [0, 1, 2, 3, 4] } },
    )
    expect(count(container)).toBe('1 of 5 got it right')
    expect(lines(container)).toEqual([
      '3 of 5 in place (2): Zezima (you), Lynx',
      '1 of 5 in place (1): Dorn',
      'None in place (1): Alkan',
    ])
  })

  it('groups a matching answer by its fields right, with no answer last', () => {
    const fields = ['a', 'b', 'c', 'd'].map((text) => ({ text }))
    const options = ['w', 'x', 'y', 'z', 'q'].map((text) => ({ text }))
    const { container } = draw(
      { a: partly(0.5), b: right(), c: partly(0.75), d: partly(0.5), e: wrong(), f: right() },
      {
        type: 'matching',
        reveal: { fields, options, answer: [0, 1, 2, 3] },
        unanswered: ['g'],
      },
    )
    expect(count(container)).toBe('2 of 6 got them all')
    expect(lines(container)).toEqual([
      '3 of 4 (1): Lynx',
      '2 of 4 (2): Zezima (you), Dorn',
      'None (1): Alkan',
      'No answer (1): Mod Ash',
    ])
  })

  it('says what a matching row counts in the results panel, where no heading does', () => {
    const fields = ['a', 'b', 'c', 'd'].map((text) => ({ text }))
    const options = ['w', 'x', 'y', 'z', 'q'].map((text) => ({ text }))
    const { container } = draw(
      { a: partly(0.5), b: right(), e: wrong() },
      { type: 'matching', reveal: { fields, options, answer: [0, 1, 2, 3] }, panel: true },
    )
    expect(
      [...container.querySelectorAll('.row .label')].map((label) => label.textContent),
    ).toEqual(['All matched', '2 of 4 matched', 'None matched'])
  })

  it('with picks, groups an ordering answer by its value, in place and out of place', () => {
    const entries = [1, 2, 3, 4, 5, 6].map((rank) => ({ text: String(rank), rank }))
    const answered = (value: number[], credit: number): PlayerResult => ({
      value,
      correct: credit === 1,
      credit,
      points: Math.round(900 * credit),
    })
    const { container } = draw(
      {
        a: answered([0, 2, 1], 2 / 3),
        b: answered([0, 1, 5], 2 / 3),
        c: answered([1, 0, 4], 1 / 3),
        d: answered([3, 4, 5], 0),
      },
      {
        showNames: false,
        type: 'ordering',
        reveal: { entries, answer: [0, 1, 2, 3, 4, 5], picks: 3 },
      },
    )
    expect(count(container)).toBe('0 of 4 got it right')
    expect(lines(container)).toEqual([
      '2 of 3 in place (1)',
      '1 of 3 in place, 2 out of place (1)',
      '0 of 3 in place, 2 out of place (1)',
      'None in place (1)',
    ])
  })

  it('lists who did not answer last and muted, and does not count them as answering', () => {
    const { container } = draw({ a: right(), b: wrong(1) }, { unanswered: ['d', 'c'] })
    expect(count(container)).toBe('1 of 2 got it right')
    expect(lines(container)).toEqual(['Granite maul (1): Woox', 'No answer (2): Dorn, Lynx'])
    expect(container.querySelector('.group:last-child')?.classList.contains('quiet')).toBe(true)
  })

  it('draws no header when everyone who answered got it right and nobody sat it out', () => {
    const { container } = draw({ a: right(), b: right() })
    expect(container.querySelector('.head')).toBeNull()
    expect(lines(container)).toEqual([])
  })

  it('says so when nobody answered', () => {
    const { container } = draw({}, { unanswered: ['a'] })
    expect(container.textContent?.trim()).toBe('Nobody answered this one.')
  })

  it('names somebody who has since left without their name', () => {
    const { container } = draw({ z: wrong() })
    expect(lines(container)[0]).toContain('Someone who left')
  })
})

describe('the suggester', () => {
  it('is named under the tally when they asked to be', () => {
    const { container } = render(RevealTally, {
      type: 'multiple_choice',
      reveal: {},
      results: { a: right() },
      nameOf,
      youId: 'a',
      showNames: false,
      suggestedBy: 'AFKFisher',
    })
    expect(container.querySelector('.credit')?.textContent).toBe('Question by AFKFisher')
  })

  it('is named even when nobody answered', () => {
    const { container } = render(RevealTally, {
      type: 'multiple_choice',
      reveal: {},
      results: {},
      nameOf,
      youId: 'a',
      showNames: false,
      suggestedBy: 'AFKFisher',
    })
    expect(container.querySelector('.credit')?.textContent).toBe('Question by AFKFisher')
  })

  it('is not there for a question nobody is credited for', () => {
    const { container } = draw({ a: right() }, { showNames: false })
    expect(container.querySelector('.credit')).toBeNull()
  })
})

describe('RevealTally in a team game', () => {
  const teamLines = (container: HTMLElement) => [...container.querySelectorAll('.team')].map(text)
  const scored = (points: number): PlayerResult => ({
    value: 0,
    correct: points > 0,
    credit: 1,
    points,
  })

  function drawTeams(results: Record<string, PlayerResult>, teamOf: Record<string, TeamId>) {
    return render(RevealTally, {
      type: 'multiple_choice',
      reveal: OPTIONS,
      results,
      nameOf,
      youId: 'a',
      showNames: true,
      teams: ['saradomin', 'zamorak', 'guthix'],
      teamOf,
    })
  }

  it("shows each team with its members' mean points, after the groups", () => {
    const { container } = drawTeams(
      { a: scored(900), b: scored(100), c: scored(400), d: scored(1200), e: wrong(1) },
      { a: 'saradomin', b: 'saradomin', c: 'saradomin', d: 'guthix', e: 'zamorak' },
    )
    expect(teamLines(container)).toEqual(['Saradomin +467', 'Zamorak +0', 'Guthix +1,200'])
    const heads = [...container.querySelectorAll('.head')].map(text)
    expect(heads).toEqual(['Got it wrong', 'Teams'])
    expect(container.querySelectorAll('.team .logo .logo')).toHaveLength(3)
  })

  it("counts a member who didn't answer as 0", () => {
    const { container } = drawTeams(
      { a: scored(900), b: scored(600) },
      { a: 'saradomin', b: 'saradomin', c: 'saradomin', d: 'zamorak' },
    )
    expect(teamLines(container)).toEqual(['Saradomin +500', 'Zamorak +0'])
  })

  it('shows the standings gain: 900, 0 and 0 is 300, not 0', () => {
    const { container } = drawTeams(
      { a: scored(900), b: wrong(), c: wrong() },
      { a: 'zamorak', b: 'zamorak', c: 'zamorak' },
    )
    expect(teamLines(container)).toEqual(['Zamorak +300'])
  })

  it('leaves a normal game without team rows', () => {
    const { container } = draw({ a: right(), b: wrong() })
    expect(container.querySelector('.teams')).toBeNull()
    expect(container.textContent).not.toContain('Teams')
  })
})
