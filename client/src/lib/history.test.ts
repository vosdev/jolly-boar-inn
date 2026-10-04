/** The finished games this browser keeps once the server has deleted their rooms. */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  findPastGame,
  HISTORY_LIMIT,
  historyPath,
  historyStamp,
  latestPastGame,
  pastGames,
  placeIn,
  removePastGame,
  savePastGame,
  type PastGame,
} from './history'
import type { Standing } from './protocol'
import { createdRooms, getSession, rememberCreated, setSession } from './session'

const STANDINGS: Standing[] = [
  { player_id: 'a', display_name: 'Zezima', points: 900, rank: 1 },
  { player_id: 'b', display_name: 'Woox', points: 600, rank: 2 },
  { player_id: 'c', display_name: 'Lynx', points: 600, rank: 2 },
]

function game(minute: number, patch: Partial<PastGame> = {}): PastGame {
  const finishedAt = new Date(Date.UTC(2026, 9, 1, 20, minute)).toISOString()
  return { code: 'DRAGON', finishedAt, standings: STANDINGS, youId: 'b', ...patch }
}

beforeEach(() => localStorage.clear())
afterEach(() => vi.restoreAllMocks())

describe('historyStamp', () => {
  it('is YYMMDDHHMM in UTC, whatever the offset the time was written with', () => {
    expect(historyStamp('2026-10-01T21:05:59+01:00')).toBe('2610012005')
    expect(historyPath({ code: 'DRAGON', finishedAt: '2026-10-01T20:05:00Z' })).toBe(
      '/history/DRAGON/2610012005',
    )
  })
})

describe('savePastGame', () => {
  it('keeps the newest first and finds a game by its link', () => {
    savePastGame(game(1, { code: 'rune' }))
    savePastGame(game(2))
    expect(pastGames().map((g) => g.code)).toEqual(['DRAGON', 'RUNE'])
    expect(findPastGame('rune', '2610012001')?.standings).toEqual(STANDINGS)
    expect(findPastGame('RUNE', '2610012002')).toBeNull()
  })

  it('files the same game once, however often its final standings arrive', () => {
    savePastGame(game(1))
    savePastGame(game(1, { standings: STANDINGS.slice(0, 1) }))
    expect(pastGames()).toHaveLength(1)
    expect(pastGames()[0]?.standings).toEqual(STANDINGS.slice(0, 1))
  })

  it('drops the oldest when the 21st game arrives', () => {
    for (let minute = 0; minute <= HISTORY_LIMIT; minute++) savePastGame(game(minute))
    const kept = pastGames()
    expect(HISTORY_LIMIT).toBe(20)
    expect(kept).toHaveLength(20)
    expect(kept.map((g) => historyStamp(g.finishedAt))).not.toContain('2610012000')
    expect(historyStamp(kept[0]?.finishedAt ?? '')).toBe('2610012020')
  })

  it('takes the room off "Rooms you created here" and keeps its session', () => {
    rememberCreated('DRAGON', '2099-01-01T00:00:00Z')
    rememberCreated('RUNE', '2099-01-01T00:00:00Z')
    setSession('DRAGON', 'token')
    savePastGame(game(1))
    expect(createdRooms()).toEqual(['RUNE'])
    expect(getSession('DRAGON')).toBe('token')
  })

  it('reads a malformed list as empty', () => {
    localStorage.setItem('jbi:history', '{not json')
    expect(pastGames()).toEqual([])
    localStorage.setItem('jbi:history', JSON.stringify([{ code: 'DRAGON' }, game(1)]))
    expect(pastGames()).toEqual([game(1)])
  })
})

describe('removePastGame', () => {
  it('drops that game and leaves the rest in order', () => {
    savePastGame(game(1))
    savePastGame(game(2))
    savePastGame(game(3))
    removePastGame(game(2))
    expect(pastGames().map((past) => past.finishedAt)).toEqual([game(3).finishedAt, game(1).finishedAt])
  })

  it('tells two games under one code apart by when they finished', () => {
    savePastGame(game(1))
    savePastGame(game(2))
    removePastGame(game(1))
    expect(findPastGame('DRAGON', historyStamp(game(2).finishedAt))).not.toBeNull()
    expect(findPastGame('DRAGON', historyStamp(game(1).finishedAt))).toBeNull()
  })
})

describe('latestPastGame', () => {
  it('is the newest game under a code that has been used twice', () => {
    savePastGame(game(1))
    savePastGame(game(5, { code: 'RUNE' }))
    savePastGame(game(9))
    expect(latestPastGame('dragon')?.finishedAt).toBe(game(9).finishedAt)
    expect(latestPastGame('BARROWS')).toBeNull()
  })
})

describe('placeIn', () => {
  it('reads a shared place as that place', () => {
    expect(placeIn(game(1))).toBe('2nd of 3')
    expect(placeIn(game(1, { youId: 'a' }))).toBe('1st of 3')
    expect(placeIn(game(1, { youId: null }))).toBeNull()
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

  it('loses the history and nothing else', () => {
    setSession('BARROWS', 'token')
    expect(() => savePastGame(game(1, { code: 'BARROWS' }))).not.toThrow()
    expect(() => pastGames()).not.toThrow()
    expect(getSession('BARROWS')).toBe('token')
  })
})
