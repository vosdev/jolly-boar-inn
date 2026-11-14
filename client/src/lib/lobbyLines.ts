/** The lobby's words about a room and the players in it. */

import { difficultyLabel } from './difficulty'
import { minutes } from './duration'
import { paceLabel } from './pace'
import type { PlayerView, RoomView } from './protocol'
import { playing } from './ready'
import { MIN_TEAMS } from './teams'

const listFormat = new Intl.ListFormat(undefined, { style: 'long', type: 'conjunction' })

/**
 * Tonight's game in one line: rounds, questions, random events, pace and length.
 *
 * The questions are every question the room actually holds, which the server counted off
 * the questions it stored rather than off the settings. The two disagree whenever the plan
 * and the stored set do: a mode whose pack pool ran short gives a round briefer than it
 * asked for, and a room created before per-mode rounds carries settings that cannot
 * describe the questions it already has. `total` is what the progress counter reads once
 * the game starts. The line tells the random events apart, which a host would otherwise
 * read as the rounds coming out longer than they set.
 */
export function roomLength(room: RoomView, rounds: number): string {
  const { settings } = room
  const secret = settings.hide_rounds === true
  const events = room.events
  const questions = room.total - events
  return (
    `${rounds}${secret ? ' secret' : ''} ${rounds === 1 ? 'round' : 'rounds'} · ` +
    `${questions} ${questions === 1 ? 'question' : 'questions'} · ` +
    (events === 0 ? '' : `${events} random ${events === 1 ? 'event' : 'events'} · `) +
    `${paceLabel(settings.pace)} pace` +
    // Mixed is every question, the default, so only a narrowed room says so.
    (settings.difficulty === 'mixed'
      ? ''
      : ` · ${difficultyLabel(settings.difficulty)} questions`) +
    ` · ${minutes(room.estimated_seconds)}`
  )
}

function joined(words: (string | null)[]): string {
  return words.filter((word) => word !== null).join(' · ')
}

/** Under a pet at the table, where the bold name says which is you and a heading the TV. */
export function tableStatus(player: PlayerView): string {
  if (player.editing === true) return 'picking a name…'
  return joined([player.connected ? null : 'away', player.role === 'admin' ? 'host' : null])
}

/** What the line under a pet's name says on the TV's own lobby, if anything. */
export function statusOf(player: PlayerView, youId: string | null): string {
  if (player.editing === true) return 'picking a name…'
  return joined([
    player.connected ? null : 'away',
    player.role === 'admin' ? 'host' : null,
    player.role === 'tv' ? 'TV' : null,
    player.id === youId ? 'you' : null,
  ])
}

/** Players by name, in a list a sentence can hold, the reader as "you". */
export function namesOf(players: PlayerView[], youId: string | null): string {
  return listFormat.format(players.map((p) => (p.id === youId ? 'you' : p.display_name)))
}

/** Why the server would refuse Start in a team game, or null when it would not. */
export function teamsBlockStart(players: PlayerView[], youId: string | null): string | null {
  const teamless = playing(players).filter((p) => p.team === null)
  if (teamless.length > 0) return `Waiting on ${namesOf(teamless, youId)} to pick a team.`
  const teams = new Set(players.map((p) => p.team).filter((t) => t !== null))
  return teams.size < MIN_TEAMS ? 'Players are needed in two teams or more.' : null
}
