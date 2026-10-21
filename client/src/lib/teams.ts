/**
 * The teams of a team game: the six gods, named once here, in the order every list of them
 * takes.
 *
 * Each god's colours are written twice, here and as a `[data-team]` block in `app.css`,
 * because the CSP lets no script paint an element: whatever wears a team's colour carries
 * `data-team` and reads `--team`, `--team-trim` and `--team-ink`. A test keeps the two
 * copies equal.
 *
 * A god's logo is its symbol from the wiki, fetched into `assets/teams/<god>.<ext>` by
 * `make fetch-assets`; without one, `TeamLogo.svelte` draws a flat placeholder.
 */

import type { PlayerView } from './protocol'
import { fileNamed } from './trophies'

/** Every team, in order. */
export const TEAM_IDS = ['saradomin', 'zamorak', 'guthix', 'armadyl', 'bandos', 'zaros'] as const

export type TeamId = (typeof TEAM_IDS)[number]

export interface Team {
  id: TeamId
  /** What a player reads: the god's name alone. */
  name: string
  /** The god's colour. */
  colour: string
  /** The edge drawn around it: the same colour, but Armadyl's gold. */
  trim: string
}

/** The six gods in order, with their names and colours. */
export const TEAMS: readonly Team[] = [
  { id: 'saradomin', name: 'Saradomin', colour: '#2f5fb3', trim: '#2f5fb3' },
  { id: 'zamorak', name: 'Zamorak', colour: '#b3302a', trim: '#b3302a' },
  { id: 'guthix', name: 'Guthix', colour: '#3d8a3a', trim: '#3d8a3a' },
  { id: 'armadyl', name: 'Armadyl', colour: '#9cc9de', trim: '#d4a52a' },
  { id: 'bandos', name: 'Bandos', colour: '#7a5230', trim: '#7a5230' },
  { id: 'zaros', name: 'Zaros', colour: '#6b3fa0', trim: '#6b3fa0' },
]

/** The fewest gods a team game has; the server refuses fewer. */
export const MIN_TEAMS = 2

/** `teams` with `id` added or (`on` false) taken out, in `TEAM_IDS` order, as `set_teams` sends it. */
export function teamsWith(teams: readonly TeamId[], id: TeamId, on: boolean): TeamId[] {
  return TEAM_IDS.filter((t) => (t === id ? on : teams.includes(t)))
}

/** The team called `id`. */
export function team(id: TeamId): Team {
  return TEAMS.find((t) => t.id === id)!
}

const logoFiles = import.meta.glob<string>('../assets/teams/*.{avif,webp,png,jpg,jpeg,svg}', {
  eager: true,
  query: '?url',
  import: 'default',
})

/** The fetched symbol for `id`, or null when it still has its placeholder. */
export function logoFile(id: TeamId, files: Record<string, string> = logoFiles): string | null {
  return fileNamed(files, id)
}

/** Each player's team by id, leaving out the teamless. */
export function teamsOf(
  players: readonly Pick<PlayerView, 'id' | 'team'>[],
): Record<string, TeamId> {
  return Object.fromEntries(
    players.flatMap((player) => (player.team === null ? [] : [[player.id, player.team]])),
  )
}

/**
 * Each playing team's median points on one question, in `teams`' order; a team without
 * members is left out.
 *
 * A median, not a mean, so one member's lucky guess or missed answer doesn't decide the
 * row. A member with no result did not answer and counts as 0. An even count takes the
 * mean of the middle two, halves rounded up as the standings round.
 */
export function teamMedians(
  teams: readonly TeamId[],
  teamOf: Readonly<Record<string, TeamId>>,
  results: Readonly<Record<string, { points: number }>>,
): { team: TeamId; points: number }[] {
  return teams.flatMap((id) => {
    const points = Object.keys(teamOf)
      .filter((player) => teamOf[player] === id)
      .map((player) => results[player]?.points ?? 0)
      .sort((a, b) => a - b)
    if (points.length === 0) return []
    const high = points[points.length >> 1]!
    const low = points[(points.length - 1) >> 1]!
    return [{ team: id, points: Math.floor((low + high + 1) / 2) }]
  })
}
