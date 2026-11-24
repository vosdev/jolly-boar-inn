/**
 * A picture dropped into the emblem slot is drawn in place of the placeholder mark, with
 * no change to the component: `emblemFile` finding one is all it takes.
 */

import { fireEvent, render } from '@testing-library/svelte'
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

  it('keeps a sprite pixelated, and scales a detail image smoothly once it loads', async () => {
    const loaded = async (width: number): Promise<HTMLImageElement> => {
      const { container } = render(Emblem, { theme: 'wilderness' })
      const img = container.querySelector('img')!
      Object.defineProperty(img, 'naturalWidth', { value: width })
      await fireEvent.load(img)
      return img
    }
    expect((await loaded(32)).classList.contains('detail')).toBe(false)
    expect((await loaded(1052)).classList.contains('detail')).toBe(true)
  })

  it('draws a mark of its own for every emblem without a file', () => {
    const marks = new Map<string, string>()
    for (const theme of EMBLEMS.filter((id) => id !== 'wilderness')) {
      const { container, unmount } = render(Emblem, { theme })
      expect(container.querySelector('img')).toBeNull()
      const svg = container.querySelector('svg')!
      expect(svg.dataset.placeholder).toBe(theme)
      marks.set(theme, svg.innerHTML)
      unmount()
    }
    expect(new Set(marks.values()).size).toBe(EMBLEMS.length - 1)
  })
})
