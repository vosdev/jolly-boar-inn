/**
 * The gods are named once, in order, and the colours `app.css` paints them with are the
 * ones named here.
 */

import { describe, expect, it } from 'vitest'

import css from '../app.css?raw'
import { logoFile, TEAM_IDS, TEAMS, teamMedians, teamsOf } from './teams'

describe('TEAMS', () => {
  it('lists the six gods in order, each named alone', () => {
    expect(TEAMS.map((t) => [t.id, t.name])).toEqual([
      ['saradomin', 'Saradomin'],
      ['zamorak', 'Zamorak'],
      ['guthix', 'Guthix'],
      ['armadyl', 'Armadyl'],
      ['bandos', 'Bandos'],
      ['zaros', 'Zaros'],
    ])
    expect(TEAMS.map((t) => t.id)).toEqual([...TEAM_IDS])
  })

  it('paints each god in app.css with the colours named here', () => {
    for (const { id, colour, trim } of TEAMS) {
      const block = new RegExp(`\\[data-team='${id}'\\] \\{([^}]*)\\}`).exec(css)?.[1] ?? ''
      expect(block, id).toContain(`--team: ${colour};`)
      expect(block, id).toContain(`--team-trim: ${trim};`)
      expect(block, id).toMatch(/--team-ink: #[0-9a-f]{6};/)
    }
  })
})

describe('logoFile', () => {
  it('finds the file named for the god, whatever its extension', () => {
    const files = {
      '../assets/teams/zamorak.png': '/assets/zamorak-abc.png',
      '../assets/teams/zaros.svg': '/assets/zaros-def.svg',
    }
    expect(logoFile('zamorak', files)).toBe('/assets/zamorak-abc.png')
    expect(logoFile('zaros', files)).toBe('/assets/zaros-def.svg')
    expect(logoFile('saradomin', files)).toBeNull()
  })
})

describe('teamsOf', () => {
  it('maps each player to their team, leaving out the teamless', () => {
    const players = [
      { id: 'a', team: 'guthix' as const },
      { id: 'b', team: null },
      { id: 'c', team: 'zaros' as const },
    ]
    expect(teamsOf(players)).toEqual({ a: 'guthix', c: 'zaros' })
  })
})

describe('teamMedians', () => {
  const scored = (points: number) => ({ points })

  it("gives each team its members' median points on the question", () => {
    const teamOf = { a: 'saradomin', b: 'saradomin', c: 'saradomin', d: 'zamorak' } as const
    const results = { a: scored(900), b: scored(100), c: scored(400), d: scored(650) }
    expect(teamMedians(['saradomin', 'zamorak'], teamOf, results)).toEqual([
      { team: 'saradomin', points: 400 },
      { team: 'zamorak', points: 650 },
    ])
  })

  it("counts a member who didn't answer as 0", () => {
    const teamOf = { a: 'guthix', b: 'guthix', c: 'guthix' } as const
    expect(teamMedians(['guthix'], teamOf, { a: scored(800), b: scored(500) })).toEqual([
      { team: 'guthix', points: 500 },
    ])
    expect(teamMedians(['guthix'], teamOf, { a: scored(800) })).toEqual([
      { team: 'guthix', points: 0 },
    ])
  })

  it('takes the mean of the middle two of an even count, rounded', () => {
    const teamOf = { a: 'zaros', b: 'zaros', c: 'zaros', d: 'zaros' } as const
    const results = { a: scored(0), b: scored(301), c: scored(600), d: scored(900) }
    expect(teamMedians(['zaros'], teamOf, results)).toEqual([{ team: 'zaros', points: 451 }])
    expect(teamMedians(['zaros'], { a: 'zaros', b: 'zaros' }, results)).toEqual([
      { team: 'zaros', points: 151 },
    ])
  })

  it('leaves out a team without members and keeps the order of the teams', () => {
    const teamOf = { a: 'bandos', b: 'saradomin' } as const
    const results = { a: scored(100), b: scored(900) }
    expect(teamMedians(['saradomin', 'armadyl', 'bandos'], teamOf, results)).toEqual([
      { team: 'saradomin', points: 900 },
      { team: 'bandos', points: 100 },
    ])
  })
})
