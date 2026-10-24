/** Who sits where at the table: the two halves, their order, teams and the TV. */

import { describe, expect, it } from 'vitest'

import type { PlayerView } from './protocol'
import { Seating, arrivals, byTeam, tableGroups } from './tableGroups'

function player(id: string, patch: Partial<PlayerView> = {}): PlayerView {
  return {
    id,
    display_name: id,
    avatar: null,
    role: 'player',
    team: null,
    connected: true,
    ready: false,
    editing: false,
    ...patch,
  }
}

const ids = (list: PlayerView[]): string[] => list.map((p) => p.id)

describe('arrivals', () => {
  it('keeps who was up in their order and appends newcomers', () => {
    expect(arrivals(['c', 'a'], ['a', 'b', 'c'])).toEqual(['c', 'a', 'b'])
    expect(arrivals(['c', 'a'], ['a'])).toEqual(['a'])
  })
})

describe('tableGroups', () => {
  const ready = (p: PlayerView): boolean => p.ready

  it('puts you first in your half, the lower half in join order', () => {
    const players = [player('a'), player('b'), player('you'), player('d')]
    const groups = tableGroups(players, 'you', ready, [])
    expect(ids(groups.lower)).toEqual(['you', 'a', 'b', 'd'])
    expect(groups.upper).toEqual([])
  })

  it('fills the upper half in the order players got there', () => {
    const players = [player('a', { ready: true }), player('b', { ready: true }), player('c')]
    expect(ids(tableGroups(players, null, ready, ['b', 'a']).upper)).toEqual(['b', 'a'])
  })

  it('keeps an away player below, whatever they did', () => {
    const players = [player('a', { ready: true, connected: false }), player('b', { ready: true })]
    const groups = tableGroups(players, null, ready, [])
    expect(ids(groups.upper)).toEqual(['b'])
    expect(ids(groups.lower)).toEqual(['a'])
  })

  it('lists the TV in neither half', () => {
    const players = [player('a'), player('tv', { role: 'tv', ready: true })]
    const groups = tableGroups(players, null, ready, [])
    expect(ids([...groups.upper, ...groups.lower])).toEqual(['a'])
    expect(groups.tv?.id).toBe('tv')
  })

  it('groups a team game by team, in god order, the teamless last', () => {
    const players = [
      player('a', { team: 'guthix' }),
      player('b'),
      player('c', { team: 'saradomin' }),
      player('d', { team: 'guthix' }),
    ]
    const rows = byTeam(players, ['guthix', 'saradomin', 'zamorak'])
    expect(rows.map((row) => [row.team, ids(row.players)])).toEqual([
      ['saradomin', ['c']],
      ['guthix', ['a', 'd']],
      [null, ['b']],
    ])
    expect(byTeam(players, [])).toEqual([])
  })
})

describe('Seating', () => {
  it('remembers who got up first until the round changes', () => {
    const seating = new Seating()
    const isUp = (p: PlayerView): boolean => p.ready
    let players = [player('a'), player('b', { ready: true })]
    seating.seat(players, null, isUp, 'q1')
    players = [player('a', { ready: true }), player('b', { ready: true })]
    expect(ids(seating.seat(players, null, isUp, 'q1').upper)).toEqual(['b', 'a'])
    expect(ids(seating.seat(players, null, isUp, 'q2').upper)).toEqual(['a', 'b'])
  })
})
