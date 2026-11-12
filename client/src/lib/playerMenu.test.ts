import { describe, expect, it } from 'vitest'

import { playerMenu, type Dialog } from './playerMenu'
import type { PlayerView } from './protocol'
import { team } from './teams'

function player(id: string, role: PlayerView['role']): PlayerView {
  return {
    id,
    display_name: id === 'a' ? 'Zezima' : 'Woox',
    role,
    connected: true,
    avatar: null,
    ready: false,
    editing: false,
    team: id === 'b' ? 'saradomin' : null,
  }
}

const HOST = player('a', 'admin')
const FREE_FOR_ALL = [] as const
const TEAMS = [team('saradomin'), team('zamorak'), team('guthix')]

/** A dialog's buttons in order, the yes button first. */
function labels(dialog: Dialog | null | undefined): string[] | undefined {
  return dialog?.choices.map((choice) => choice.label)
}

/** The dialog a choice asks next. */
function then(dialog: Dialog | null, label: string): Dialog | undefined {
  return dialog?.choices.find((choice) => choice.label === label)?.then
}

describe('playerMenu', () => {
  it('offers nothing to a player or the TV, nor to a host tapping themselves', () => {
    const woox = player('b', 'player')
    expect(playerMenu(woox, player('c', 'player'), FREE_FOR_ALL, 1)).toBeNull()
    expect(playerMenu(woox, player('c', 'tv'), TEAMS, 1)).toBeNull()
    expect(playerMenu(woox, null, FREE_FOR_ALL, 1)).toBeNull()
    expect(playerMenu(HOST, HOST, TEAMS, 2)).toBeNull()
  })

  it('kicks a player at once, and asks once more before making them a host', () => {
    const menu = playerMenu(player('b', 'player'), HOST, FREE_FOR_ALL, 1)
    expect(menu?.hint).toBe('kick or make host')
    expect(menu?.message).toBe('Kick Woox, or make them a host?')
    expect(menu?.choices).toEqual([
      { label: 'Kick', send: { t: 'kick', player_id: 'b' } },
      expect.objectContaining({ label: 'Make host…' }),
      { label: 'Make TV', send: { t: 'set_tv', player_id: 'b', on: true } },
    ])
    expect(then(menu, 'Make host…')).toEqual({
      message: "Make Woox a host? This can't be undone.",
      choices: [{ label: 'Make host', send: { t: 'promote', player_id: 'b' } }],
    })
  })

  it('moves a player in a team game to any team but their own', () => {
    const menu = playerMenu(player('b', 'player'), HOST, TEAMS, 1)
    expect(menu?.hint).toBe('kick, make host or move team')
    expect(menu?.message).toBe('Kick Woox, make them a host, or move them to another team?')
    expect(labels(menu)).toEqual(['Kick', 'Make host…', 'Make TV', 'Move team…'])
    expect(then(menu, 'Move team…')).toEqual({
      message: 'Move Woox to which team?',
      choices: [
        { label: 'Zamorak', send: { t: 'move_team', player_id: 'b', team: 'zamorak' } },
        { label: 'Guthix', send: { t: 'move_team', player_id: 'b', team: 'guthix' } },
      ],
    })
  })

  it('makes another admin the TV, and moves them in a team game, but never kicks them', () => {
    const admin = player('b', 'admin')
    const free = playerMenu(admin, HOST, FREE_FOR_ALL, 2)
    expect(free).toMatchObject({ hint: 'make TV', message: 'Make Woox the TV?' })
    expect(free?.choices).toEqual([
      { label: 'Make TV', send: { t: 'set_tv', player_id: 'b', on: true } },
    ])
    const teams = playerMenu(admin, HOST, TEAMS, 2)
    expect(teams).toMatchObject({
      hint: 'make TV or move team',
      message: 'Make Woox the TV, or move them to another team?',
    })
    expect(labels(teams)).toEqual(['Make TV', 'Move team…'])
  })

  it('never makes the last admin the TV: free for all offers nothing, teams only a move', () => {
    const admin = player('b', 'admin')
    expect(playerMenu(admin, HOST, FREE_FOR_ALL, 1)).toBeNull()
    const menu = playerMenu(admin, HOST, TEAMS, 1)
    expect(menu).toMatchObject({ hint: 'make TV or move team', message: null })
    expect(labels(menu)).toEqual(['Move team…'])
    expect(labels(then(menu, 'Move team…'))).toEqual(['Zamorak', 'Guthix'])
  })

  it('kicks the TV or makes it a player again, with or without teams', () => {
    for (const teams of [FREE_FOR_ALL, TEAMS]) {
      expect(playerMenu(player('b', 'tv'), HOST, teams, 1)).toEqual({
        hint: 'kick or not the TV',
        message: 'Kick Woox, or turn off TV mode for them?',
        choices: [
          { label: 'Kick', send: { t: 'kick', player_id: 'b' } },
          { label: 'Not the TV', send: { t: 'set_tv', player_id: 'b', on: false } },
        ],
      })
    }
  })
})
