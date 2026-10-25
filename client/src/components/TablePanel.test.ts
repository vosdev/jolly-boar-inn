/** The table panel's pets: two abreast, each a small icon over a whole name. */

import { render, screen, within } from '@testing-library/svelte'
import { describe, expect, it } from 'vitest'

import type { PlayerView } from '../lib/protocol'
import panelSource from './TablePanel.svelte?raw'
import TablePanel from './TablePanel.svelte'
import petSource from './TablePet.svelte?raw'

function player(id: string, name: string): PlayerView {
  return {
    id,
    display_name: name,
    avatar: 'aggy',
    role: 'player',
    team: null,
    connected: true,
    ready: false,
    editing: false,
  }
}

/** The body of one rule in a component's `<style>`. */
function rule(source: string, selector: string): string {
  const start = source.indexOf(`\n  ${selector} {`)
  expect(start).toBeGreaterThan(-1)
  return source.slice(start, source.indexOf('}', start))
}

const NAMES = ['TwintigApril', 'WWWWWWWWWWWW', 'Zezima', 'MMMMMMMMMMMM']

describe('TablePanel', () => {
  it('seats pets two abreast, each a 32px icon over the whole name on one line', () => {
    render(TablePanel, {
      groups: {
        upper: [],
        lower: NAMES.map((name, n) => player(String(n), name)),
        upperTeams: [],
        lowerTeams: [],
        tv: null,
      },
      youId: '0',
      labels: ['Ready', 'Not ready yet'],
    })
    const items = within(screen.getByRole('list', { name: 'Not ready yet' })).getAllByRole(
      'listitem',
    )
    expect(items.map((item) => item.querySelector('.pet-name')?.textContent)).toEqual(NAMES)
    for (const item of items) {
      const pet = item.querySelector<HTMLElement>('.pet')!
      expect([pet.style.width, pet.style.height]).toEqual(['32px', '32px'])
    }
    expect(rule(panelSource, '.pets')).toContain(
      'grid-template-columns: repeat(2, minmax(0, 1fr));',
    )
    const name = rule(petSource, '.pet-name')
    expect(name).toContain('white-space: nowrap;')
    expect(name).not.toMatch(/ellipsis|overflow: hidden|line-clamp/)
  })
})
