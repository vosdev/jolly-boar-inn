/** The ordering form's draft: ranks from order and tie boxes, read back, and what it refuses. */

import { describe, expect, it } from 'vitest'

import {
  answerLine,
  draftOf,
  previewOf,
  problems,
  questionOf,
  ranksOf,
  wordingOf,
  type OrderingDraft,
  type OrderingQuestion,
} from './ordering'

function draft(over: Partial<OrderingDraft> = {}): OrderingDraft {
  return {
    prompt: 'Sort the gems by the Crafting level that cuts them.',
    ends: ['Lowest', 'Highest'],
    entries: [
      { text: 'Sapphire', detail: 'Level 20', tied: false },
      { text: 'Emerald', detail: '', tied: false },
      { text: 'Ruby', detail: '', tied: false },
      { text: 'Diamond', detail: '', tied: false },
    ],
    picks: null,
    explanation: '',
    extra: {},
    ...over,
  }
}

function paths(question: OrderingQuestion): string[] {
  return problems(question).map((problem) => problem.path)
}

describe('ranksOf', () => {
  it('numbers entries from 1, and a tie shares the number above it without skipping one', () => {
    expect(ranksOf([{ tied: false }, { tied: false }, { tied: false }])).toEqual([1, 2, 3])
    expect(ranksOf([{ tied: false }, { tied: true }, { tied: false }, { tied: false }])).toEqual([
      1, 1, 2, 3,
    ])
    expect(ranksOf([{ tied: false }, { tied: true }, { tied: true }, { tied: false }])).toEqual([
      1, 1, 1, 2,
    ])
  })

  it('ignores a tie box on the first entry', () => {
    expect(ranksOf([{ tied: true }, { tied: false }])).toEqual([1, 2])
  })
})

describe('questionOf', () => {
  it('writes ranks from the order and the tie boxes, in answer order, trimmed', () => {
    const entries = draft().entries
    entries[1]!.tied = true
    entries[0]!.text = '  Sapphire '
    const question = questionOf(draft({ entries, explanation: ' Twenty. ' }))
    expect(question).toEqual({
      type: 'ordering',
      payload: {
        prompt: 'Sort the gems by the Crafting level that cuts them.',
        ends: ['Lowest', 'Highest'],
        entries: [
          { text: 'Sapphire', rank: 1, detail: 'Level 20' },
          { text: 'Emerald', rank: 1 },
          { text: 'Ruby', rank: 2 },
          { text: 'Diamond', rank: 3 },
        ],
        answer: [0, 1, 2, 3],
        explanation: 'Twenty.',
      },
    })
    expect(problems(question)).toEqual([])
  })

  it('keeps picks only when set', () => {
    expect(questionOf(draft()).payload).not.toHaveProperty('picks')
    expect(questionOf(draft({ picks: 3 })).payload.picks).toBe(3)
  })
})

describe('draftOf', () => {
  it('starts with three blank entries', () => {
    const blank = draftOf()
    expect(blank.entries).toHaveLength(3)
    expect(blank.picks).toBeNull()
  })

  it('reads a stored question back to the same question', () => {
    const stored = questionOf(
      draft({
        entries: [
          { text: 'A', detail: '', tied: false },
          { text: 'B', detail: 'x', tied: true },
          { text: 'C', detail: '', tied: false },
          { text: 'D', detail: '', tied: true },
        ],
        picks: 2,
        explanation: 'Because.',
      }),
    )
    expect(draftOf(stored).entries.map((entry) => entry.tied)).toEqual([false, true, false, true])
    expect(questionOf(draftOf(stored))).toEqual(stored)
  })

  it('lists entries in answer order, whatever order they were stored in', () => {
    const stored: OrderingQuestion = {
      type: 'ordering',
      payload: {
        prompt: 'p',
        ends: ['a', 'b'],
        entries: [
          { text: 'Last', rank: 3 },
          { text: 'First', rank: 1 },
          { text: 'Middle', rank: 2 },
        ],
        answer: [1, 2, 0],
      },
    }
    expect(draftOf(stored).entries.map((entry) => entry.text)).toEqual(['First', 'Middle', 'Last'])
  })

  it('keeps a field it has no control for', () => {
    const stored = questionOf(draft({ extra: { image: 'item:4151' } }))
    expect(stored.payload.image).toBe('item:4151')
    expect(draftOf(stored).extra).toEqual({ image: 'item:4151' })
  })
})

describe('problems', () => {
  it('passes a good question, with and without picks', () => {
    expect(problems(questionOf(draft()))).toEqual([])
    expect(problems(questionOf(draft({ picks: 3 })))).toEqual([])
  })

  it('refuses fewer than three entries and more than six', () => {
    const few = draft({ entries: draft().entries.slice(0, 2) })
    expect(paths(questionOf(few))).toContain('payload.entries')
    const many = draft({
      entries: Array.from({ length: 7 }, (_, i) => ({ text: `E${i}`, detail: '', tied: false })),
    })
    expect(paths(questionOf(many))).toContain('payload.entries')
  })

  it('refuses a missing end label and over-long text', () => {
    expect(paths(questionOf(draft({ ends: ['', 'Highest'] })))).toContain('payload.ends[0]')
    expect(paths(questionOf(draft({ ends: ['Lowest', 'x'.repeat(41)] })))).toContain('payload.ends[1]')
    const entries = draft().entries
    entries[2]!.text = 'x'.repeat(121)
    entries[3]!.detail = 'y'.repeat(41)
    expect(paths(questionOf(draft({ entries })))).toEqual(
      expect.arrayContaining(['payload.entries[2].text', 'payload.entries[3].detail']),
    )
    expect(paths(questionOf(draft({ prompt: '' })))).toContain('payload.prompt')
  })

  it('refuses a repeated entry, however it is spaced or cased', () => {
    const entries = draft().entries
    entries[2]!.text = '  emerald'
    expect(problems(questionOf(draft({ entries })))).toEqual([
      expect.objectContaining({ path: 'payload.entries[2].text', message: 'Same as entry 2.' }),
    ])
  })

  it('refuses what ordering.check() does about ties and picks', () => {
    const tied = draft().entries.map((entry, i) => ({ ...entry, tied: i > 0 }))
    expect(paths(questionOf(draft({ entries: tied })))).toContain('payload.entries')
    const front = draft().entries
    front[1]!.tied = true
    front[2]!.tied = true
    expect(paths(questionOf(draft({ entries: front, picks: 2 })))).toContain('payload.picks')
    expect(paths(questionOf(draft({ picks: 4 })))).toContain('payload.picks')
    expect(paths(questionOf(draft({ picks: 1 })))).toContain('payload.picks')
  })

  it('refuses a payload whose ranks skip one, or whose answer is out of order', () => {
    const skipped = questionOf(draft())
    ;(skipped.payload.entries as { rank: number }[])[3]!.rank = 5
    expect(paths(skipped)).toContain('payload.entries')
    const backwards = questionOf(draft())
    backwards.payload.answer = [1, 0, 2, 3]
    expect(paths(backwards)).toContain('payload.answer')
  })

  it('refuses a character Postgres cannot store', () => {
    expect(paths(questionOf(draft({ explanation: 'a\u0000b' })))).toContain('payload.explanation')
  })

  it('refuses a key that is not part of an ordering', () => {
    const odd = { ...questionOf(draft()), random_event: 'bob' }
    expect(paths(odd)).toContain('random_event')
  })
})

describe('a round whose entries are dated', () => {
  it('needs a detail on every entry, which no other round does', () => {
    const question = questionOf(draft())
    expect(problems(question)).toEqual([])
    const missing = problems(question, true).map((problem) => problem.path)
    expect(missing).toEqual([
      'payload.entries[1].detail',
      'payload.entries[2].detail',
      'payload.entries[3].detail',
    ])
  })

  it('words its form for dates', () => {
    expect(wordingOf('release_order')).toMatchObject({ ends: ['Oldest', 'Newest'], detailRequired: true })
    expect(wordingOf('sort_it_out').detailRequired).toBe(false)
  })
})

describe('previewOf', () => {
  it('shows the entries as text only, and not in the order they were written', () => {
    const open = previewOf(questionOf(draft({ picks: 2 })), 'sort_it_out')
    expect(open.type).toBe('ordering')
    expect(open.view.entries).toEqual([
      { text: 'Emerald' },
      { text: 'Ruby' },
      { text: 'Diamond' },
      { text: 'Sapphire' },
    ])
    expect(open.view.ends).toEqual(['Lowest', 'Highest'])
    expect(open.view.picks).toBe(2)
    expect(JSON.stringify(open.view)).not.toMatch(/rank|Level 20/)
  })
})

describe('answerLine', () => {
  it('reads first to last, ties joined with =, and says how many are ordered', () => {
    const entries = draft().entries
    entries[1]!.tied = true
    const { payload } = questionOf(draft({ entries, picks: 3 }))
    expect(answerLine(payload)).toBe(
      'Sapphire (Level 20) = Emerald → Ruby → Diamond (the first 3 are ordered)',
    )
  })
})
