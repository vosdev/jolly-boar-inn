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
  /** What a team game paints over the player's theme, as `--frame*` in `app.css`. */
  frame: Frame
}

/** A team game's frame: the top bar, the window's edge and the timer, in the god's colours. */
export interface Frame {
  /** The top bar and the timer's tabs. */
  bar: string
  /** What reads on `bar`. */
  ink: string
  /** The window's edge. */
  edge: string
  /** The timer's track. */
  dark: string
  /** The timer's fill. */
  light: string
}

/** The six gods in order, with their names and colours. */
export const TEAMS: readonly Team[] = [
  {
    id: 'saradomin',
    name: 'Saradomin',
    colour: '#2f5fb3',
    trim: '#2f5fb3',
    frame: { bar: '#2f5fb3', ink: '#fff8e6', edge: '#2f5fb3', dark: '#1f3f78', light: '#8fb3ee' },
  },
  {
    id: 'zamorak',
    name: 'Zamorak',
    colour: '#b3302a',
    trim: '#b3302a',
    frame: { bar: '#b3302a', ink: '#fff8e6', edge: '#b3302a', dark: '#7d1f1a', light: '#ef8a7c' },
  },
  {
    id: 'guthix',
    name: 'Guthix',
    colour: '#3d8a3a',
    trim: '#3d8a3a',
    frame: { bar: '#357a32', ink: '#fff8e6', edge: '#357a32', dark: '#285c26', light: '#9fd88c' },
  },
  {
    id: 'armadyl',
    name: 'Armadyl',
    colour: '#9cc9de',
    trim: '#d4a52a',
    frame: { bar: '#d4a52a', ink: '#241a02', edge: '#d4a52a', dark: '#8f6c12', light: '#ecca6a' },
  },
  {
    id: 'bandos',
    name: 'Bandos',
    colour: '#7a5230',
    trim: '#7a5230',
    frame: { bar: '#7a5230', ink: '#fff8e6', edge: '#7a5230', dark: '#523620', light: '#d1a275' },
  },
  {
    id: 'zaros',
    name: 'Zaros',
    colour: '#6b3fa0',
    trim: '#6b3fa0',
    frame: { bar: '#6b3fa0', ink: '#fff8e6', edge: '#6b3fa0', dark: '#472a6b', light: '#b89be0' },
  },
]

/** The fewest gods a team game has; the server refuses fewer. */
export const MIN_TEAMS = 2

/** `teams` with `id` added or (`on` false) taken out, in `TEAM_IDS` order, as `set_teams` sends it. */
export function teamsWith(teams: readonly TeamId[], id: TeamId, on: boolean): TeamId[] {
  return TEAM_IDS.filter((t) => (t === id ? on : teams.includes(t)))
}

/**
 * Frame the window in `team`'s god, or take the frame off with null. Like a theme, the
 * frame is nothing but an attribute on <html>: `data-team` there selects the `--frame*`
 * tokens, and the top bar, the timer and the window's edge read them.
 */
export function wearTeam(team: TeamId | null): void {
  if (team === null) delete document.documentElement.dataset.team
  else document.documentElement.dataset.team = team
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
