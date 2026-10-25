/**
 * Who sits where in the table panel (section 9 of ideas/design.md): the players split in
 * two, those who have answered (or readied) on top and the rest below, each half by team
 * in a team game. The TV sits in neither; it is listed apart.
 *
 * An away player is always below. The server says who is still to answer only among the
 * connected, so an away player's answer is unknowable here; they move up again once
 * they are back, if they did answer.
 */

import type { PlayerView } from './protocol'
import { TEAM_IDS, type TeamId } from './teams'

/** One team's members in a half, or the players with no team (`team: null`). */
export interface TeamRow {
  team: TeamId | null
  players: PlayerView[]
}

export interface TableGroups {
  upper: PlayerView[]
  lower: PlayerView[]
  /** The halves by team in god order, the teamless last; empty outside a team game. */
  upperTeams: TeamRow[]
  lowerTeams: TeamRow[]
  tv: PlayerView | null
}

/**
 * The order the upper half fills in: `previous` kept for those still up, newcomers
 * appended in the order `up` lists them.
 */
export function arrivals(previous: readonly string[], up: readonly string[]): string[] {
  const now = new Set(up)
  const kept = previous.filter((id) => now.has(id))
  const seen = new Set(kept)
  return [...kept, ...up.filter((id) => !seen.has(id))]
}

/** Each team with somebody in `list`, in god order, then the teamless. */
export function byTeam(list: readonly PlayerView[], teams: readonly TeamId[]): TeamRow[] {
  if (teams.length === 0) return []
  const rows: TeamRow[] = TEAM_IDS.filter((id) => teams.includes(id)).map((team) => ({
    team,
    players: list.filter((p) => p.team === team),
  }))
  rows.push({ team: null, players: list.filter((p) => p.team === null) })
  return rows.filter((row) => row.players.length > 0)
}

/**
 * Split `players` (in join order) by `isUp`. You come first in your half; the upper half
 * then follows `order` (from `arrivals`), the lower one join order.
 */
export function tableGroups(
  players: readonly PlayerView[],
  youId: string | null,
  isUp: (player: PlayerView) => boolean,
  order: readonly string[],
  teams: readonly TeamId[] = [],
): TableGroups {
  const seated = players.filter((p) => p.role !== 'tv')
  const youFirst = (list: PlayerView[]): PlayerView[] => [
    ...list.filter((p) => p.id === youId),
    ...list.filter((p) => p.id !== youId),
  ]
  const rank = new Map(order.map((id, at) => [id, at]))
  const upper = youFirst(
    seated
      .filter((p) => p.connected && isUp(p))
      .map((p, at) => ({ p, at: rank.get(p.id) ?? -1, join: at }))
      .sort((a, b) => a.at - b.at || a.join - b.join)
      .map(({ p }) => p),
  )
  const lower = youFirst(seated.filter((p) => !(p.connected && isUp(p))))
  return {
    upper,
    lower,
    upperTeams: byTeam(upper, teams),
    lowerTeams: byTeam(lower, teams),
    tv: players.find((p) => p.role === 'tv') ?? null,
  }
}

/** The ids `isUp` puts in the upper half, in join order, for `arrivals`. */
export function upIds(
  players: readonly PlayerView[],
  isUp: (player: PlayerView) => boolean,
): string[] {
  return players.filter((p) => p.role !== 'tv' && p.connected && isUp(p)).map((p) => p.id)
}

/**
 * The panel's halves as they change, remembering the order the upper half filled in
 * until `round` changes: a new question, or the lobby giving way to a splash.
 */
export class Seating {
  #order: string[] = []
  #round: unknown = undefined

  seat(
    players: readonly PlayerView[],
    youId: string | null,
    isUp: (player: PlayerView) => boolean,
    round: unknown,
    teams: readonly TeamId[] = [],
  ): TableGroups {
    if (round !== this.#round) {
      this.#round = round
      this.#order = []
    }
    this.#order = arrivals(this.#order, upIds(players, isUp))
    return tableGroups(players, youId, isUp, this.#order, teams)
  }
}
