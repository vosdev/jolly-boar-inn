/** Refusals in the words a player reads, not the server's. */

import { describe, expect, it } from 'vitest'

import { errorText } from './errors'
import type { ErrorCode } from './protocol'

function refusal(code: ErrorCode, message = 'from the server'): string {
  return errorText({ t: 'error', code, message })
}

describe('errorText', () => {
  it('says an answer that missed the close was too late', () => {
    expect(refusal('not_open', 'no question is open')).toBe('Too late, that question had closed.')
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
