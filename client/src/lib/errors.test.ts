/** Refusals in the words a player reads, not the server's. */

import { describe, expect, it } from 'vitest'

import { errorText, refusedEarly } from './errors'
import type { ErrorCode, OpenQuestion } from './protocol'

function refusal(code: ErrorCode, message = 'from the server'): string {
  return errorText({ t: 'error', code, message })
}

describe('errorText', () => {
  it('says an answer that missed the close was too late', () => {
    expect(refusal('not_open', 'no question is open')).toBe(
      'Too late — that question already closed.',
    )
  })

  it.each<[ErrorCode, string]>([
    ['already_answered', "You've already answered this one."],
    ['excluded', "You can't answer this question."],
    ['bad_value', "That answer didn't go through. Try again."],
    ['not_admin', 'Only a host can do that.'],
  ])('has words of its own for %s', (code, text) => {
    expect(refusal(code)).toBe(text)
  })

  it.each<ErrorCode>(['bad_state', 'bad_message', 'bad_hello', 'name_taken'])(
    'keeps the server message for %s',
    (code) => {
      expect(refusal(code, 'nobody is connected to play')).toBe('nobody is connected to play')
    },
  )
})

describe('an early not_open', () => {
  const event = {
    answerable_at: '2026-09-25T12:00:05Z',
    ends_at: '2026-09-25T12:00:15Z',
  } as OpenQuestion

  it('says to hold on rather than too late', () => {
    expect(errorText({ t: 'error', code: 'not_open', message: 'x', early: true })).toBe(
      "Hold on, answers aren't open yet.",
    )
  })

  it('is one refused while the question is still open, even once its hold has ended', () => {
    expect(refusedEarly(event, Date.parse('2026-09-25T12:00:04Z'))).toBe(true)
    expect(refusedEarly(event, Date.parse('2026-09-25T12:00:06Z'))).toBe(true)
  })

  it('is not one after the close, or for a question with no hold, or none at all', () => {
    expect(refusedEarly(event, Date.parse('2026-09-25T12:00:15Z'))).toBe(false)
    expect(
      refusedEarly(
        { ...event, answerable_at: undefined } as unknown as OpenQuestion,
        Date.parse('2026-09-25T12:00:04Z'),
      ),
    ).toBe(false)
    expect(refusedEarly(null, 0)).toBe(false)
  })
})
