/** Codes as players type them, and the list of rooms created in this browser. */

import { beforeEach, describe, expect, it } from 'vitest'

import { createdRooms, forgetCreated, isRoomCode, normalizeCode, rememberCreated } from './session'

beforeEach(() => localStorage.clear())

describe('normalizeCode', () => {
  it.each([
    ['abyssal bludgeon', 'ABYSSALBLUDGEON'],
    ['abyssal-bludgeon', 'ABYSSALBLUDGEON'],
    ["Ahrim's Staff", 'AHRIMSSTAFF'],
    ['  dragon12 ', 'DRAGON12'],
  ])('reads %j as %s', (typed, code) => {
    expect(normalizeCode(typed)).toBe(code)
  })
})

describe('isRoomCode', () => {
  it('takes 1 to 32 letters and digits, and nothing else', () => {
    expect(isRoomCode('ABYSSALBLUDGEON')).toBe(true)
    expect(isRoomCode('')).toBe(false)
    expect(isRoomCode('A'.repeat(33))).toBe(false)
  })
})

describe('createdRooms', () => {
  const NOW = Date.parse('2026-09-25T12:00:00Z')

  it('lists a room until its expiry and not after', () => {
    rememberCreated('dragon', '2026-09-28T12:00:00Z')
    expect(createdRooms(NOW)).toEqual(['DRAGON'])
    expect(createdRooms(Date.parse('2026-09-28T12:00:00Z'))).toEqual([])
  })

  it('lists the newest first, once each', () => {
    rememberCreated('DRAGON', '2099-01-01T00:00:00Z')
    rememberCreated('RUNE', '2099-01-01T00:00:00Z')
    rememberCreated('DRAGON', '2099-01-02T00:00:00Z')
    expect(createdRooms(NOW)).toEqual(['DRAGON', 'RUNE'])
  })

  it('drops entries stored before expiries were, which have no time to go on', () => {
    localStorage.setItem('jbi:created', JSON.stringify(['DRAGON', 'RUNE']))
    expect(createdRooms(NOW)).toEqual([])
  })

  it('forgets a room it is told to', () => {
    rememberCreated('DRAGON', '2099-01-01T00:00:00Z')
    rememberCreated('RUNE', '2099-01-01T00:00:00Z')
    forgetCreated('dragon')
    expect(createdRooms(NOW)).toEqual(['RUNE'])
  })
})
