import { describe, expect, it } from 'vitest'

import WORDS from '../../../data/room-words.json'
import { HINT_MAX_LETTERS, HINT_WORDS, nextHint } from './codeHints'

describe('HINT_WORDS', () => {
  it('are room words, every one short enough to fit the field', () => {
    expect(HINT_WORDS.length).toBeGreaterThan(100)
    for (const word of HINT_WORDS) {
      expect(WORDS).toContain(word)
      expect(word.length).toBeLessThanOrEqual(HINT_MAX_LETTERS)
    }
    expect(HINT_WORDS).not.toContain('ThermonuclearSmokeDevil')
  })
})

describe('nextHint', () => {
  it('never shows the same word twice running', () => {
    const first = HINT_WORDS[0]!
    expect(nextHint(first, () => 0)).not.toBe(first)
  })

  it('picks across the whole list', () => {
    expect(nextHint(null, () => 0)).toBe(HINT_WORDS[0])
    expect(nextHint(null, () => 0.9999)).toBe(HINT_WORDS.at(-1))
  })
})
