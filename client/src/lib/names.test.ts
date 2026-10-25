/**
 * `nameProblem` and `normalizeName` against the server's own cases, so the hint under the
 * name field never passes a name the join then refuses, or stops one it would take.
 */

import { describe, expect, it } from 'vitest'

import CASES from '../../../server/tests/name_cases.json'
import BASES from '../../../data/player-names.json'
import { CREDIT_MAX, generateName, NAME_MAX, nameProblem, normalizeName, resuffix } from './names'

describe('names the server takes', () => {
  it.each(CASES.accepted)('%j is stored as %j', (raw, stored) => {
    expect(nameProblem(raw)).toBeNull()
    expect(normalizeName(raw)).toBe(stored)
  })
})

describe('names the server refuses', () => {
  it.each(CASES.refused)('%j', (raw) => {
    expect(nameProblem(raw)).not.toBeNull()
  })

  it('says which characters a name may have', () => {
    expect(nameProblem('Tom & Jerry')).toBe('Only letters, digits, spaces, _ and - in a name.')
  })
})

describe('the length', () => {
  it('stops a name at 12 characters, and a credit at 24', () => {
    expect(NAME_MAX).toBe(12)
    expect(nameProblem('x'.repeat(12))).toBeNull()
    expect(nameProblem('x'.repeat(13))).toBe('At most 12 characters.')
    expect(nameProblem('x'.repeat(24), CREDIT_MAX)).toBeNull()
    expect(nameProblem('x'.repeat(25), CREDIT_MAX)).toBe('At most 24 characters.')
  })
})

describe('generated names', () => {
  it('are a base from the corpus, bare', () => {
    for (let n = 0; n < 50; n++) expect(BASES).toContain(generateName())
  })

  it('on a clash, cut a 12-character base so its number fits', () => {
    const base = BASES.find((name) => name.length === NAME_MAX && !/\d$/.test(name))!
    for (let n = 0; n < 200; n++) {
      const next = resuffix(base)
      expect(next).toMatch(/^[A-Za-z_]+\d{1,3}$/)
      expect([...next].length).toBeLessThanOrEqual(NAME_MAX)
      expect(base.startsWith(next.replace(/\d+$/, ''))).toBe(true)
      expect(nameProblem(next)).toBeNull()
    }
  })
})
