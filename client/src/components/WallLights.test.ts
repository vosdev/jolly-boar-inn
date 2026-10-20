/**
 * The wall lights hang while a theme that has them is on, and only then, following
 * `data-theme` on <html> as the menu changes it: the inn's lanterns under Jolly, the door
 * logos under both Gauntlets.
 */

import { render } from '@testing-library/svelte'
import { tick } from 'svelte'
import { afterEach, describe, expect, it } from 'vitest'

import WallLights from './WallLights.svelte'
import source from './WallLights.svelte?raw'

describe('WallLights', () => {
  afterEach(() => {
    delete document.documentElement.dataset.theme
  })

  const lights = (container: HTMLElement): string[] =>
    [...container.querySelectorAll('[data-light]')].map((l) => l.getAttribute('data-light') ?? '')

  const shown = async (theme: string): Promise<HTMLElement> => {
    document.documentElement.dataset.theme = theme
    const { container } = render(WallLights)
    await tick()
    return container
  }

  it('hangs a lantern either side under jolly, hidden from screen readers', async () => {
    const container = await shown('jolly')
    const wall = container.querySelector('.wall-lights')
    expect(wall?.getAttribute('aria-hidden')).toBe('true')
    expect(wall?.getAttribute('data-lights')).toBe('jolly')
    expect(lights(container)).toEqual(['left', 'right'])
  })

  it('hangs a door logo either side under the Gauntlet, not a lantern', async () => {
    const container = await shown('gauntlet')
    expect(container.querySelector('.wall-lights')?.getAttribute('data-lights')).toBe('gauntlet')
    expect(lights(container)).toEqual(['left', 'right'])
    expect(container.querySelectorAll('[data-light] svg[viewBox="-66 -66 132 132"]')).toHaveLength(
      2,
    )
    expect(container.querySelector('[data-light] svg[viewBox="0 0 97 160"]')).toBeNull()
  })

  it('lights the door logos red under the Corrupted Gauntlet, cyan under the Gauntlet', async () => {
    const glows = (container: HTMLElement): string[] => [
      ...new Set(
        [...container.querySelectorAll('[data-light] svg circle[r="37"]')].map(
          (ring) => ring.closest('g')?.getAttribute('stroke') ?? '',
        ),
      ),
    ]
    const corrupted = await shown('corrupted_gauntlet')
    expect(corrupted.querySelector('.wall-lights')?.getAttribute('data-lights')).toBe(
      'corrupted_gauntlet',
    )
    expect(lights(corrupted)).toEqual(['left', 'right'])
    expect(glows(corrupted)).toEqual(['#0c1414', '#e2483e'])
    corrupted.remove()
    expect(glows(await shown('gauntlet'))).toEqual(['#0c1414', '#1ac8d8'])
  })

  it('gives each lantern its own glass, so the two drawings never share an id', async () => {
    const container = await shown('jolly')
    const ids = [...container.querySelectorAll('[id]')].map((el) => el.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it.each(['pollnivneach', 'wilderness', 'party_room', 'tzhaar', 'jungle', 'morytania'])(
    'draws nothing under %s',
    async (theme) => {
      const container = await shown(theme)
      expect(container.querySelector('.wall-lights')).toBeNull()
    },
  )

  it('follows the theme as the player switches to it and away', async () => {
    const container = await shown('wilderness')
    document.documentElement.dataset.theme = 'jolly'
    await new Promise((settle) => setTimeout(settle))
    await tick()
    expect(lights(container)).toHaveLength(2)
    document.documentElement.dataset.theme = 'gauntlet'
    await new Promise((settle) => setTimeout(settle))
    await tick()
    expect(container.querySelectorAll('[data-light] svg[viewBox="-66 -66 132 132"]')).toHaveLength(
      2,
    )
    document.documentElement.dataset.theme = 'tzhaar'
    await new Promise((settle) => setTimeout(settle))
    await tick()
    expect(container.querySelector('.wall-lights')).toBeNull()
  })

  it('hides the lights below 800px, where the stage fills the window', () => {
    const style = source.slice(source.indexOf('<style>')).replace(/\/\*[\s\S]*?\*\//g, '')
    expect(style).toMatch(/\.wall-lights \{[^}]*display: none;/)
    const shown = [...style.matchAll(/display: block;/g)]
    expect(shown).toHaveLength(1)
    expect(style).toMatch(
      /@media \(min-width: 50rem\) \{\s*\.wall-lights \{\s*display: block;\s*\}/,
    )
  })
})
