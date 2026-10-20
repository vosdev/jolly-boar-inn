/**
 * A picture dropped into the emblem slot is drawn in place of the placeholder mark, with
 * no change to the component: `emblemFile` finding one is all it takes.
 */

import { render } from '@testing-library/svelte'
import { describe, expect, it, vi } from 'vitest'

import { EMBLEMS } from '../lib/emblems'
import Emblem from './Emblem.svelte'

vi.mock('../lib/emblems', async (original) => ({
  ...(await original<typeof import('../lib/emblems')>()),
  emblemFile: (theme: string) => (theme === 'wilderness' ? '/assets/wilderness-abc.png' : null),
}))

describe('Emblem', () => {
  it('draws the dropped-in file for a theme that has one', () => {
    const { container } = render(Emblem, { theme: 'wilderness' })
    expect(container.querySelector('img')?.getAttribute('src')).toBe('/assets/wilderness-abc.png')
    expect(container.querySelector('svg')).toBeNull()
  })

  it('draws a mark of its own for every emblem without a file, a recolour its original’s', () => {
    const marks = new Map<string, string>()
    for (const theme of EMBLEMS.filter((id) => id !== 'wilderness')) {
      const { container, unmount } = render(Emblem, { theme })
      expect(container.querySelector('img')).toBeNull()
      const svg = container.querySelector('svg')!
      expect(svg.dataset.placeholder).toBe(theme)
      marks.set(theme, svg.innerHTML)
      unmount()
    }
    expect(marks.get('corrupted_gauntlet')).toBe(marks.get('gauntlet'))
    marks.delete('corrupted_gauntlet')
    expect(new Set(marks.values()).size).toBe(EMBLEMS.length - 2)
  })
})
