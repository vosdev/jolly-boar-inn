/**
 * The standings as the Wise Old Man presents them (section 11 of ideas/design.md). Pure.
 *
 * The server ranks, and says what the latest round gained and where everyone stood before
 * it; this only arranges, words and times it.
 *
 * Between rounds the hiscores start in the order they stood in before the round, the
 * gains count up, and the rows move to their places. The final first presents ranks five
 * to one, a trophy each, then the whole table. Ranks are dense (section 6), so a place is a
 * rank and everyone holding it is presented together; nobody on 0 points gets a trophy.
 */

import type { Standing, TeamStanding } from './protocol'
import { team, TEAM_IDS, type TeamId } from './teams'

/** Who presents every standings screen: wiseoldman.net is where OSRS players track gains. */
export const HISCORES_HOST = 'wise_old_man'

/** The Quest Speedrunning trophies, first to fifth. The art is `lib/trophies.ts`'s. */
export const TIERS = ['diamond', 'platinum', 'gold', 'silver', 'bronze'] as const
export type Tier = (typeof TIERS)[number]

/** Pets a place draws before the rest become a `+N`. */
export const PETS_PER_PLACE = 3

export interface Place {
  rank: number
  tier: Tier
  /** Everyone holding this rank, in the server's order. */
  standings: Standing[]
  /** The ones whose pets are drawn; past these they are the place's `+N`. */
  shown: Standing[]
  more: number
}

/** The final's places in the order they are presented: fifth first, each rank someone scored on. */
export function ceremonyPlaces(standings: readonly Standing[]): Place[] {
  return TIERS.map((tier, i) => {
    const on = standings.filter((standing) => standing.rank === i + 1 && standing.points > 0)
    return {
      rank: i + 1,
      tier,
      standings: on,
      shown: on.slice(0, PETS_PER_PLACE),
      more: Math.max(0, on.length - PETS_PER_PLACE),
    }
  })
    .filter((place) => place.standings.length > 0)
    .reverse()
}

export interface Movement {
  up: boolean
  by: number
}

/** Places moved since the round before; null in the first round, or for no move. */
export function movement(standing: Pick<Standing, 'rank' | 'previous_rank'>): Movement | null {
  if (standing.previous_rank === null) return null
  const by = standing.previous_rank - standing.rank
  return by === 0 ? null : { up: by > 0, by: Math.abs(by) }
}

/** The total before the round the standings are for. */
export function pointsBefore(standing: Pick<Standing, 'points' | 'points_gained'>): number {
  return standing.points - standing.points_gained
}

/**
 * The hiscores as they stood before the round: by the rank then, and within a rank, and
 * in the first round, which has none, in `joinOrder`, the room's player ids.
 */
export function previousOrder(
  standings: readonly Standing[],
  joinOrder: readonly string[],
): Standing[] {
  const joined = (standing: Standing): number => {
    const at = joinOrder.indexOf(standing.player_id)
    return at === -1 ? joinOrder.length : at
  }
  return [...standings].sort(
    (a, b) => (a.previous_rank ?? 0) - (b.previous_rank ?? 0) || joined(a) - joined(b),
  )
}

/** The teams as they stood before the round: by the rank then, ties and the first round in god order. */
export function previousTeamOrder(teams: readonly TeamStanding[]): TeamStanding[] {
  return [...teams].sort(
    (a, b) =>
      (a.previous_rank ?? 0) - (b.previous_rank ?? 0) ||
      TEAM_IDS.indexOf(a.team) - TEAM_IDS.indexOf(b.team),
  )
}

/** A team's members by `teamOf`, best first; level ones keep the server's order. */
export function membersOf(
  god: TeamId,
  standings: readonly Standing[],
  teamOf: Readonly<Record<string, TeamId>>,
): Standing[] {
  return standings
    .filter((standing) => teamOf[standing.player_id] === god)
    .sort((a, b) => b.points - a.points)
}

/** The teams sharing first place, if any of them scored. */
export function winningTeams(teams: readonly TeamStanding[]): TeamId[] {
  return teams.filter((t) => t.rank === 1 && t.points > 0).map((t) => t.team)
}

const ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth']

export const FINAL_INTRO = 'The final scores are in!'

/** The Wise Old Man between rounds, `round` counted from 1. */
export function roundLine(round: number): string {
  return `Round ${round} done. Let’s see who truly knows Gielinor best.`
}

/** What the Wise Old Man says before a place is shown. */
export function placeLine(place: Place): string {
  if (place.standings.length > 1) return `Tied for ${ORDINALS[place.rank - 1]}…`
  return [
    'And top of the hiscores…',
    'So close! In second…',
    'Third place goes to…',
    'Fourth…',
    'In fifth place…',
  ][place.rank - 1]!
}

/** "A", "A and B", "A, B and C". */
export function listNames(names: readonly string[]): string {
  return names.length <= 1
    ? (names[0] ?? '')
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/** The Wise Old Man over the final hiscores: the winners, or nobody. */
export function winnersLine(winners: readonly string[]): string {
  return winners.length === 0
    ? 'Nobody scored. A quiet night at the inn.'
    : `Gz, ${listNames(winners)}! Here are the full hiscores.`
}

/** The Wise Old Man over a team game's final hiscores: "Saradomin wins!", or nobody. */
export function teamWinnersLine(teams: readonly TeamStanding[]): string {
  const names = winningTeams(teams).map((god) => team(god).name)
  if (names.length === 0) return winnersLine([])
  return `${listNames(names)} ${names.length === 1 ? 'wins' : 'win'}!`
}

/** The ms of one line typed at the scroll's 50 letters a second. */
export function typingMs(letters: number, perSecond = 50): number {
  return (letters * 1000) / perSecond
}

/**
 * The final's ceremony, in ms from the screen mounting. The intro types from `open`,
 * then for each place its line types, a pause, the place appears and holds; first place
 * holds longest. `lines[0]` is the intro's start and `lines[i + 1]` place i's line;
 * `shows[i]` is when place i appears, and at `end` the table takes over.
 */
export const CEREMONY = {
  open: 300,
  afterIntro: 1050,
  beforePlace: 600,
  hold: 2850,
  holdFirst: 4800,
  /** The last place fades before the table unrolls. */
  leave: 300,
}

export interface CeremonyTimes {
  lines: number[]
  shows: number[]
  end: number
}

/** When each part of the ceremony starts; `letters` is the intro's, then each place line's. */
export function ceremonyTimes(
  letters: readonly number[],
  open: number = CEREMONY.open,
): CeremonyTimes {
  const [intro = 0, ...places] = letters
  let at = open
  const lines = [at]
  const shows: number[] = []
  at += typingMs(intro) + CEREMONY.afterIntro
  places.forEach((count, i) => {
    lines.push(at)
    at += typingMs(count) + CEREMONY.beforePlace
    shows.push(at)
    at += i === places.length - 1 ? CEREMONY.holdFirst : CEREMONY.hold
  })
  return { lines, shows, end: at }
}

/**
 * Between rounds, in ms from the screen mounting: the line types from `open`, then the
 * gains count up, then the rows move, then your row may pin.
 */
export const SHUFFLE = { open: 300, afterLine: 300, count: 700, beforeMove: 1000, move: 650 }

export interface ShuffleTimes {
  settle: number
  move: number
  pin: number
}

export function shuffleTimes(lineLetters: number, open: number = SHUFFLE.open): ShuffleTimes {
  const settle = open + typingMs(lineLetters) + SHUFFLE.afterLine
  const move = settle + SHUFFLE.beforeMove
  return { settle, move, pin: move + SHUFFLE.move }
}

/** How long the final table takes to unroll, for `rows` rows, and each row's delay. */
export function unrollMs(rows: number): number {
  return Math.min(1600, 300 + rows * 60)
}

export function arrivalDelay(row: number, rows: number): number {
  return Math.min(row * 60, unrollMs(rows) - 300)
}
