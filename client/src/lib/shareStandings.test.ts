import { describe, expect, it } from 'vitest'

import type { Standing, TeamStanding } from './protocol'
import { standingsShareText, type ShareGame } from './shareStandings'
import type { TeamId } from './teams'

const ORIGIN = 'https://jollyboar.example'

function standing(id: string, name: string, points: number, rank: number): Standing {
  return {
    player_id: id,
    display_name: name,
    avatar: null,
    points,
    rank,
    points_gained: 0,
    previous_rank: null,
  }
}

const PLAYERS = [
  standing('a', 'Zezima', 14200, 1),
  standing('b', 'Woox', 13950, 2),
  standing('c', 'B0aty', 12100, 3),
  standing('d', 'Lynx Titan', 10400, 4),
  standing('e', 'Mod Ash', 9800, 5),
]

function solo(youId: string | null): ShareGame {
  return { standings: PLAYERS, teamStandings: null, teamOf: {}, youId }
}

function teamRow(god: TeamId, points: number, rank: number): TeamStanding {
  return { team: god, points, rank, points_gained: 0, previous_rank: null }
}

const TEAMS: ShareGame = {
  standings: PLAYERS,
  teamStandings: [teamRow('saradomin', 13075, 1), teamRow('zamorak', 11067, 2)],
  teamOf: { a: 'saradomin', b: 'zamorak', c: 'saradomin', d: 'zamorak', e: 'zamorak' },
  youId: 'e',
}

describe('the share text without teams', () => {
  it('lists the top three and where the sharer came', () => {
    expect(standingsShareText(solo('e'), 'top', ORIGIN)).toBe(
      [
        'Quiz night at The Jolly Boar Inn: 5 players.',
        '🥇 Zezima 14,200',
        '🥈 Woox 13,950',
        '🥉 B0aty 12,100',
        'I came 5th with 9,800. Think you can beat us?',
        ORIGIN,
      ].join('\n'),
    )
  })

  it('lists everyone, numbered after the medals, without the sharer line', () => {
    expect(standingsShareText(solo('e'), 'all', ORIGIN)).toBe(
      [
        'Quiz night at The Jolly Boar Inn: 5 players.',
        '🥇 Zezima 14,200',
        '🥈 Woox 13,950',
        '🥉 B0aty 12,100',
        '4. Lynx Titan 10,400',
        '5. Mod Ash 9,800',
        'Think you can beat us?',
        ORIGIN,
      ].join('\n'),
    )
  })

  it('leaves out the sharer line for a sharer in the top three', () => {
    const lines = standingsShareText(solo('b'), 'top', ORIGIN).split('\n')
    expect(lines.at(-2)).toBe('Think you can beat us?')
  })

  it('leaves out the sharer line for a browser not in the standings', () => {
    const lines = standingsShareText(solo(null), 'top', ORIGIN).split('\n')
    expect(lines.at(-2)).toBe('Think you can beat us?')
  })

  it('gives players level on rank the same medal', () => {
    const game: ShareGame = {
      ...solo(null),
      standings: [
        standing('a', 'Zezima', 900, 1),
        standing('b', 'Woox', 900, 1),
        standing('c', 'B0aty', 800, 2),
        standing('d', 'Lynx Titan', 700, 3),
        standing('e', 'Mod Ash', 600, 4),
      ],
    }
    expect(standingsShareText(game, 'top', ORIGIN).split('\n').slice(1, 5)).toEqual([
      '🥇 Zezima 900',
      '🥇 Woox 900',
      '🥈 B0aty 800',
      '🥉 Lynx Titan 700',
    ])
  })

  it('counts a single player as one', () => {
    const game: ShareGame = { ...solo('a'), standings: [PLAYERS[0]!] }
    expect(standingsShareText(game, 'top', ORIGIN).split('\n')[0]).toBe(
      'Quiz night at The Jolly Boar Inn: 1 player.',
    )
  })
})

describe('the share text of a team game', () => {
  it('lists every god by its average and the sharer god', () => {
    expect(standingsShareText(TEAMS, 'top', ORIGIN)).toBe(
      [
        'Quiz night at The Jolly Boar Inn: 2 gods, 5 players.',
        '🥇 Saradomin 13,075 avg',
        '🥈 Zamorak 11,067 avg',
        'I fought for Zamorak and scored 9,800. Think you can beat us?',
        ORIGIN,
      ].join('\n'),
    )
  })

  it('lists every god past the third', () => {
    const game: ShareGame = {
      ...TEAMS,
      teamStandings: [
        teamRow('saradomin', 400, 1),
        teamRow('zamorak', 300, 2),
        teamRow('guthix', 200, 3),
        teamRow('armadyl', 100, 4),
      ],
    }
    expect(standingsShareText(game, 'top', ORIGIN).split('\n')[4]).toBe('4. Armadyl 100 avg')
  })

  it('lists the players under their god, best first', () => {
    expect(standingsShareText(TEAMS, 'all', ORIGIN)).toBe(
      [
        'Quiz night at The Jolly Boar Inn: 2 gods, 5 players.',
        '🥇 Saradomin 13,075 avg',
        '   Zezima 14,200 · B0aty 12,100',
        '🥈 Zamorak 11,067 avg',
        '   Woox 13,950 · Lynx Titan 10,400 · Mod Ash 9,800',
        'Think you can beat us?',
        ORIGIN,
      ].join('\n'),
    )
  })
})

describe('what the share text leaves out', () => {
  it('holds no room code and no session token, and links Home', () => {
    for (const game of [solo('e'), TEAMS]) {
      for (const scope of ['top', 'all'] as const) {
        const text = standingsShareText(game, scope, ORIGIN)
        expect(text.split('\n').at(-1)).toBe(ORIGIN)
        expect(text).not.toMatch(/\/r\/|\/history\/|token|session/i)
      }
    }
  })
})
