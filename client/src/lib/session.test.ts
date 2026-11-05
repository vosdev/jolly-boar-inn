/**
 * Codes as players type them, the list of rooms created in this browser, and sessions
 * kept for the page when storage throws.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  clearSession,
  createdRooms,
  forgetCreated,
  getSession,
  isRoomCode,
  normalizeCode,
  readStored,
  rememberCreated,
  setSession,
  writeStored,
} from './session'

beforeEach(() => localStorage.clear())
afterEach(() => vi.restoreAllMocks())

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
    rememberCreated('FireCape', '2026-09-28T12:00:00Z')
    expect(createdRooms(NOW)).toEqual(['FireCape'])
    expect(createdRooms(Date.parse('2026-09-28T12:00:00Z'))).toEqual([])
  })

  it('lists the newest first, once each, whatever case a code came in', () => {
    rememberCreated('FIRECAPE', '2099-01-01T00:00:00Z')
    rememberCreated('Rune', '2099-01-01T00:00:00Z')
    rememberCreated('FireCape', '2099-01-02T00:00:00Z')
    expect(createdRooms(NOW)).toEqual(['FireCape', 'Rune'])
  })

  it('drops entries stored before expiries were, which have no time to go on', () => {
    localStorage.setItem('jbi:created', JSON.stringify(['DRAGON', 'RUNE']))
    expect(createdRooms(NOW)).toEqual([])
  })

  it('forgets a room it is told to', () => {
    rememberCreated('FireCape', '2099-01-01T00:00:00Z')
    rememberCreated('Rune', '2099-01-01T00:00:00Z')
    forgetCreated('firecape')
    expect(createdRooms(NOW)).toEqual(['Rune'])
  })
})

describe('with storage full', () => {
  it('reads back a write that failed over an older stored value', () => {
    localStorage.setItem('jbi:history', 'old')
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError')
    })
    writeStored('jbi:history', 'new')
    expect(readStored('jbi:history')).toBe('new')
  })
})

describe('with storage throwing', () => {
  beforeEach(() => {
    const denied = (): never => {
      throw new DOMException('The operation is insecure.', 'SecurityError')
    }
    for (const method of ['getItem', 'setItem', 'removeItem'] as const) {
      vi.spyOn(Storage.prototype, method).mockImplementation(denied)
    }
  })

  it('keeps a session for the page, so a join still reaches its room', () => {
    setSession('dragon', 'token')
    expect(getSession('DRAGON')).toBe('token')
    clearSession('DRAGON')
    expect(getSession('DRAGON')).toBeNull()
  })

  it('keeps the rooms created here for the page', () => {
    rememberCreated('RUNE', '2099-01-01T00:00:00Z')
    expect(createdRooms(Date.parse('2098-01-01T00:00:00Z'))).toEqual(['RUNE'])
    forgetCreated('RUNE')
    expect(createdRooms(Date.parse('2098-01-01T00:00:00Z'))).toEqual([])
  })
})
