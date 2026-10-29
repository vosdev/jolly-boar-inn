/**
 * The host's question bank kept in this browser: one entry each with its tick, read back in
 * order, and a broken one left out without the rest.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { HostQuestion } from './customQuestions'
import { BANK_MAX, loadBank, sameQuestion, saveBank, type Banked } from './savedQuestions'

const choice = (prompt: string): HostQuestion => ({
  type: 'multiple_choice',
  payload: { prompt, options: ['Hans', 'Bartender'], answer_index: 1 },
})
const banked = (prompt: string, used = true): Banked => ({ question: choice(prompt), used })

beforeEach(() => localStorage.clear())
afterEach(() => vi.restoreAllMocks())

describe('the question bank', () => {
  it('reads back what was saved, ticks included, in order, each question its own entry', () => {
    const bank = [banked('A'), { question: { ...choice('B'), random_event: 'genie' }, used: false }]
    saveBank(bank)
    expect(loadBank()).toEqual({ bank, dropped: 0 })
    expect(JSON.parse(localStorage.getItem('jbi:own-question:1')!)).toEqual(bank[1])
  })

  it('starts empty in a browser that saved nothing', () => {
    expect(loadBank()).toEqual({ bank: [], dropped: 0 })
  })

  it('forgets the entries past a shorter bank, and everything for an empty one', () => {
    saveBank([banked('A'), banked('B'), banked('C')])
    saveBank([banked('C')])
    expect(loadBank().bank).toEqual([banked('C')])
    expect(localStorage.getItem('jbi:own-question:1')).toBeNull()
    saveBank([])
    expect(localStorage.length).toBe(0)
  })

  it('drops an entry the server would refuse, without a tick, or not JSON, and keeps the rest', () => {
    saveBank([banked('A'), banked('B'), banked('C'), banked('D')])
    localStorage.setItem('jbi:own-question:0', '{"question":')
    const unknownNpc = { question: { ...choice('B'), random_event: 'zezima' }, used: true }
    localStorage.setItem('jbi:own-question:1', JSON.stringify(unknownNpc))
    localStorage.setItem('jbi:own-question:2', JSON.stringify(choice('C')))
    expect(loadBank()).toEqual({ bank: [banked('D')], dropped: 3 })
  })

  it(`reads no more than ${BANK_MAX} questions`, () => {
    saveBank(Array.from({ length: BANK_MAX + 1 }, (_, i) => banked(`Q${i}`)))
    expect(loadBank().bank).toHaveLength(BANK_MAX)
  })

  it('keeps the bank for the page when storage refuses', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError')
    })
    saveBank([banked('A')])
    expect(loadBank().bank).toEqual([banked('A')])
  })
})

describe('sameQuestion', () => {
  it('matches field for field, whatever the key order, and nothing less', () => {
    const reordered: HostQuestion = {
      payload: { answer_index: 1, options: ['Hans', 'Bartender'], prompt: 'A' },
      type: 'multiple_choice',
    }
    expect(sameQuestion(choice('A'), reordered)).toBe(true)
    expect(sameQuestion(choice('A'), choice('B'))).toBe(false)
    expect(sameQuestion(choice('A'), { ...choice('A'), random_event: 'genie' })).toBe(false)
  })
})
