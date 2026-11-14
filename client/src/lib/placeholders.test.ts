import { describe, expect, it } from 'vitest'
import { CHOICES } from './suggestions'
import { fieldHints } from './placeholders'

describe('fieldHints', () => {
  it('has hints of its own for each round whose prompt is typed', () => {
    const rounds = CHOICES.filter(
      (c) =>
        c.kind === 'question' &&
        c.prompt?.fixed !== true &&
        c.editor !== 'place' &&
        c.id !== 'random_event' &&
        c.id !== 'no_round',
    )
    expect(rounds.length).toBeGreaterThan(0)
    for (const c of rounds) expect(fieldHints(c.id), c.id).not.toBe(fieldHints('custom'))
  })

  it('gives an explanation to each round that takes one', () => {
    for (const c of CHOICES.filter((c) => c.kind === 'question' && c.explanation !== false)) {
      if (c.id === 'whos_that_npc') continue
      expect(fieldHints(c.id).explanation, c.id).not.toBe('')
    }
  })

  it('falls back for a random event, a custom question and no round', () => {
    for (const id of ['random_event', 'custom', 'no_round']) {
      expect(fieldHints(id)).toBe(fieldHints('custom'))
    }
  })
})
