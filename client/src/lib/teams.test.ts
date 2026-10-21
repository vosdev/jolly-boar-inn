/**
 * The gods are named once, in order, and the colours `app.css` paints them with are the
 * ones named here.
 */

import { describe, expect, it } from 'vitest'

import css from '../app.css?raw'
import { logoFile, TEAM_IDS, TEAMS } from './teams'

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
