/**
 * `nameProblem` and `normalizeName` against the server's own cases, so the hint under the
 * name field never passes a name the join then refuses, or stops one it would take.
 */

import { describe, expect, it } from 'vitest'

import CASES from '../../../server/tests/name_cases.json'
import { nameProblem, normalizeName } from './names'

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
