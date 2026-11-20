/**
 * The share text of a finished party game, copied from the final standings.
 *
 * It names no room: a finished room takes no joins, and a code in pasted text would only
 * invite strangers into the next game held under it. The link is Home.
 */

import { siteName } from 'virtual:branding'

import { membersOf } from './hiscores'
import type { Standing, TeamStanding } from './protocol'
import { team, type TeamId } from './teams'

/** What the text lists: the top three or everyone, the gods alone or with their players. */
export type ShareScope = 'top' | 'all'

const MEDALS = ['🥇', '🥈', '🥉']
const ORDINAL = new Intl.PluralRules('en', { type: 'ordinal' })
const SUFFIX: Record<string, string> = { one: 'st', two: 'nd', few: 'rd', other: 'th' }
const DARE = 'Think you can beat us?'

function points(value: number): string {
  return value.toLocaleString('en-US')
}

function place(rank: number): string {
  return MEDALS[rank - 1] ?? `${rank}.`
}

function ordinal(rank: number): string {
  return `${rank}${SUFFIX[ORDINAL.select(rank)] ?? 'th'}`
}

function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

export interface ShareGame {
  standings: readonly Standing[]
  /** A team game's teams, ranked; null outside one. */
  teamStandings: readonly TeamStanding[] | null
  teamOf: Readonly<Record<string, TeamId>>
  youId: string | null
}

/** The text a player pastes after a party game, ending in a link to `origin`. */
export function standingsShareText(game: ShareGame, scope: ShareScope, origin: string): string {
  const { standings, teamStandings, teamOf, youId } = game
  const you = standings.find((standing) => standing.player_id === youId)
  const lines: string[] = []
  let own: string | null = null

  if (teamStandings === null) {
    lines.push(`Quiz night at ${siteName}: ${count(standings.length, 'player', 'players')}.`)
    const listed = scope === 'all' ? standings : standings.filter((s) => s.rank <= MEDALS.length)
    for (const standing of listed) {
      lines.push(`${place(standing.rank)} ${standing.display_name} ${points(standing.points)}`)
    }
    if (you !== undefined && !listed.includes(you)) {
      own = `I came ${ordinal(you.rank)} with ${points(you.points)}.`
    }
  } else {
    const gods = count(teamStandings.length, 'god', 'gods')
    lines.push(
      `Quiz night at ${siteName}: ${gods}, ${count(standings.length, 'player', 'players')}.`,
    )
    for (const row of teamStandings) {
      lines.push(`${place(row.rank)} ${team(row.team).name} ${points(row.points)} avg`)
      if (scope === 'all') {
        const members = membersOf(row.team, standings, teamOf)
        if (members.length > 0) {
          lines.push(
            `   ${members.map((m) => `${m.display_name} ${points(m.points)}`).join(' · ')}`,
          )
        }
      }
    }
    const yours = you === undefined ? undefined : teamOf[you.player_id]
    if (you !== undefined && yours !== undefined && scope === 'top') {
      own = `I fought for ${team(yours).name} and scored ${points(you.points)}.`
    }
  }

  lines.push(own === null ? DARE : `${own} ${DARE}`, origin)
  return lines.join('\n')
}
