/**
 * Finished games, kept in this browser after the server deletes the room.
 *
 * Every browser in a room files the result when the final standings arrive, under the
 * code and the server's `finished_at`, so all of them build the same link to it. The
 * list is newest first and capped, and like every other stored value it is lost, not
 * fatal, when localStorage refuses.
 */

import type { Standing } from './protocol'
import { dropCreated, normalizeCode, readStored, writeStored } from './session'

const HISTORY_KEY = 'jbi:history'
export const HISTORY_LIMIT = 20

export interface PastGame {
  /** As the server spells it, `FireCape`, so links and lists read as the word. */
  code: string
  /** The server's ISO time the game ended. */
  finishedAt: string
  standings: Standing[]
  /** This browser's player in `standings`. */
  youId: string | null
}

/** `finishedAt` as `YYMMDDHHMM` in UTC: every browser's clock agrees on it, not on a zone. */
export function historyStamp(finishedAt: string): string {
  const iso = new Date(finishedAt).toISOString()
  return (
    iso.slice(2, 4) + iso.slice(5, 7) + iso.slice(8, 10) + iso.slice(11, 13) + iso.slice(14, 16)
  )
}

/** Where a past game opens. */
export function historyPath(game: Pick<PastGame, 'code' | 'finishedAt'>): string {
  return `/history/${game.code}/${historyStamp(game.finishedAt)}`
}

/** Which game an entry is, whatever case its code was filed in. */
function sameGame(
  a: Pick<PastGame, 'code' | 'finishedAt'>,
  b: Pick<PastGame, 'code' | 'finishedAt'>,
): boolean {
  return (
    normalizeCode(a.code) === normalizeCode(b.code) &&
    historyStamp(a.finishedAt) === historyStamp(b.finishedAt)
  )
}

function isPastGame(raw: unknown): raw is PastGame {
  if (typeof raw !== 'object' || raw === null) return false
  const { code, finishedAt, standings, youId } = raw as Record<string, unknown>
  return (
    typeof code === 'string' &&
    typeof finishedAt === 'string' &&
    !Number.isNaN(Date.parse(finishedAt)) &&
    Array.isArray(standings) &&
    (youId === null || typeof youId === 'string')
  )
}

/** The games finished in this browser, newest first. */
export function pastGames(): PastGame[] {
  const raw = readStored(HISTORY_KEY)
  if (raw === null) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(isPastGame) : []
  } catch {
    return []
  }
}

/**
 * File a finished game, replacing an earlier copy of the same one, and take its room off
 * "Rooms you created here": the room is about to be deleted, and its result lives here.
 */
export function savePastGame(game: PastGame): void {
  const rest = pastGames().filter((other) => !sameGame(other, game))
  const games = [game, ...rest]
    .sort((a, b) => Date.parse(b.finishedAt) - Date.parse(a.finishedAt))
    .slice(0, HISTORY_LIMIT)
  writeStored(HISTORY_KEY, JSON.stringify(games))
  dropCreated(game.code)
}

/** Take one game off the list; it is the only copy, so it is gone for good. */
export function removePastGame(game: Pick<PastGame, 'code' | 'finishedAt'>): void {
  writeStored(HISTORY_KEY, JSON.stringify(pastGames().filter((other) => !sameGame(other, game))))
}

/** The game a history link names, or null if this browser never filed it. */
export function findPastGame(code: string, stamp: string): PastGame | null {
  const normalized = normalizeCode(code)
  return (
    pastGames().find(
      (game) => normalizeCode(game.code) === normalized && historyStamp(game.finishedAt) === stamp,
    ) ?? null
  )
}

/** The newest game filed under a code, for a room link whose room is gone. */
export function latestPastGame(code: string): PastGame | null {
  const normalized = normalizeCode(code)
  return pastGames().find((game) => normalizeCode(game.code) === normalized) ?? null
}

const ORDINAL = new Intl.PluralRules('en', { type: 'ordinal' })
const SUFFIX: Record<string, string> = { one: 'st', two: 'nd', few: 'rd', other: 'th' }

/** This browser's place in a past game, "2nd of 5", or null if it was not in the standings. */
export function placeIn(game: PastGame): string | null {
  const own = game.standings.find((standing) => standing.player_id === game.youId)
  if (own === undefined) return null
  const suffix = SUFFIX[ORDINAL.select(own.rank)] ?? 'th'
  return `${own.rank}${suffix} of ${game.standings.length}`
}
