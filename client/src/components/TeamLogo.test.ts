/**
 * A god's symbol in `assets/teams/` is drawn in place of the placeholder, with no change
 * to the component.
 */

import { render } from '@testing-library/svelte'
import { describe, expect, it, vi } from 'vitest'

import { TEAM_IDS } from '../lib/teams'
import TeamLogo from './TeamLogo.svelte'

vi.mock('../lib/teams', async (original) => ({
  ...(await original<typeof import('../lib/teams')>()),
  logoFile: (id: string) => (id === 'zaros' ? '/assets/zaros-abc.png' : null),
}))

describe('TeamLogo', () => {
  it('draws the fetched file for a god that has one', () => {
    const { container } = render(TeamLogo, { team: 'zaros' })
    expect(container.querySelector('img')?.getAttribute('src')).toBe('/assets/zaros-abc.png')
    expect(container.querySelector('svg')).toBeNull()
  })

  it('draws a placeholder of its own, in its god’s colours, for every god without a file', () => {
    const marks = new Set<string>()
    for (const team of TEAM_IDS.filter((id) => id !== 'zaros')) {
      const { container, unmount } = render(TeamLogo, { team })
      expect(container.querySelector('img')).toBeNull()
      const svg = container.querySelector('svg')!
      expect(svg.dataset.placeholder).toBe(team)
      expect(svg.dataset.team).toBe(team)
      marks.add(svg.innerHTML)
      unmount()
    }
    expect(marks.size).toBe(TEAM_IDS.length - 1)
  })
})
