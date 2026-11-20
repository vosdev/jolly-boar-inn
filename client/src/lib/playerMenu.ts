/**
 * What an admin's tap on a pet in the lobby offers: kick, make host, the TV or a move.
 *
 * Choosing Kick is its own confirmation, since a kicked player can join again; Make host
 * asks once more, because there is no demote and an admin cannot be kicked. The same menu
 * makes a player or another admin the room's TV, or the TV a player again, at once, since
 * either can be undone, but never the last admin, which the server would refuse. In a team
 * game the host moves a player from it too, an admin as well: admins cannot be kicked but
 * can play for the wrong god.
 */

import type { ClientMessage, PlayerView } from './protocol'
import type { Team } from './teams'

/** A button in the dialog: what it sends, or the question it asks next. */
export interface Choice {
  label: string
  send?: ClientMessage
  then?: Dialog
}

export interface Dialog {
  /** The question, or null when its one choice is made at once, unasked. */
  message: string | null
  /** The yes button first, then the others. */
  choices: Choice[]
}

export interface PlayerMenu extends Dialog {
  /** What the tap offers, for the end of the pet's accessible name. */
  hint: string
}

/** Whether the server would let this player become the TV: never the last admin. */
function canBeTV(player: PlayerView, admins: number): boolean {
  return player.role === 'player' || (player.role === 'admin' && admins > 1)
}

function moveTo(player: PlayerView, teams: readonly Team[]): Choice {
  return {
    label: 'Move team…',
    then: {
      message: `Move ${player.display_name} to which team?`,
      choices: teams
        .filter((t) => t.id !== player.team)
        .map((t) => ({
          label: t.name,
          send: { t: 'move_team', player_id: player.id, team: t.id },
        })),
    },
  }
}

/**
 * The menu `you` get on tapping `player`, or null when the tap offers nothing. `teams` are
 * the room's, none in a free for all; `admins` counts the room's admins.
 */
export function playerMenu(
  player: PlayerView,
  you: Pick<PlayerView, 'id' | 'role'> | null,
  teams: readonly Team[],
  admins: number,
): PlayerMenu | null {
  if (you?.role !== 'admin' || player.id === you.id) return null
  const name = player.display_name
  const teamGame = teams.length > 0
  const id = player.id
  const move = teamGame ? [moveTo(player, teams)] : []
  if (player.role === 'tv') {
    return {
      hint: 'kick or turn off TV mode',
      message: `Kick ${name}, or switch them back to a player?`,
      choices: [
        { label: 'Kick', send: { t: 'kick', player_id: id } },
        { label: 'Turn off TV mode', send: { t: 'set_tv', player_id: id, on: false } },
      ],
    }
  }
  const makeTV: Choice = { label: 'Make TV', send: { t: 'set_tv', player_id: id, on: true } }
  if (player.role === 'admin') {
    const hint = teamGame ? 'make TV or move team' : 'make TV'
    if (!canBeTV(player, admins)) return teamGame ? { hint, message: null, choices: move } : null
    return {
      hint,
      message: teamGame
        ? `Make ${name} the TV, or move them to another team?`
        : `Make ${name} the TV?`,
      choices: [makeTV, ...move],
    }
  }
  return {
    hint: teamGame ? 'kick, make host or move team' : 'kick or make host',
    message: teamGame
      ? `Kick ${name}, make them a host, or move them to another team?`
      : `Kick ${name}, or make them a host?`,
    choices: [
      { label: 'Kick', send: { t: 'kick', player_id: id } },
      {
        label: 'Make host…',
        then: {
          message: `Make ${name} a host? This can't be undone.`,
          choices: [{ label: 'Make host', send: { t: 'promote', player_id: id } }],
        },
      },
      makeTV,
      ...move,
    ],
  }
}
