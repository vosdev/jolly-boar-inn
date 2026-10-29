/**
 * The host's questions kept in this browser: one entry each, read back in order, and a
 * broken one left out without the rest.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { HostQuestion } from './customQuestions'
import { loadQuestions, saveQuestions } from './savedQuestions'

const choice = (prompt: string): HostQuestion => ({
  type: 'multiple_choice',
  payload: { prompt, options: ['Hans', 'Bartender'], answer_index: 1 },
})

beforeEach(() => localStorage.clear())
afterEach(() => vi.restoreAllMocks())

describe('saved questions', () => {
  it('reads back what was saved, in order, each question its own entry', () => {
    const list = [choice('A'), { ...choice('B'), random_event: 'genie' }]
    saveQuestions(list)
    expect(loadQuestions()).toEqual({ questions: list, dropped: 0 })
    expect(JSON.parse(localStorage.getItem('jbi:own-question:1')!)).toEqual(list[1])
  })

  it('starts empty in a browser that saved nothing', () => {
    expect(loadQuestions()).toEqual({ questions: [], dropped: 0 })
  })

  it('forgets the entries past a shorter list, and everything for an empty one', () => {
    saveQuestions([choice('A'), choice('B'), choice('C')])
    saveQuestions([choice('C')])
    expect(loadQuestions().questions).toEqual([choice('C')])
    expect(localStorage.getItem('jbi:own-question:1')).toBeNull()
    saveQuestions([])
    expect(localStorage.length).toBe(0)
  })

  it('drops a question the server would refuse, or that is not JSON, and keeps the rest', () => {
    saveQuestions([choice('A'), choice('B'), choice('C')])
    localStorage.setItem('jbi:own-question:0', '{"type":"multiple_choice"')
    const unknownNpc = { ...choice('B'), random_event: 'zezima' }
    localStorage.setItem('jbi:own-question:1', JSON.stringify(unknownNpc))
    expect(loadQuestions()).toEqual({ questions: [choice('C')], dropped: 2 })
  })

  it('keeps the list for the page when storage refuses', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError')
    })
    saveQuestions([choice('A')])
    expect(loadQuestions().questions).toEqual([choice('A')])
  })
})
