/**
 * The wall lights hang while a theme that has them is on, and only then, following
 * `data-theme` on <html> as the menu changes it: the inn's lanterns under Jolly, torches
 * under the Wilderness, sulphur vents under Toktz, the door logos under both Gauntlets, a
 * fairy ring in their place under Zanaris.
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

  it('hangs a torch either side under the Wilderness, flickering', async () => {
    const container = await shown('wilderness')
    expect(container.querySelector('.wall-lights')?.getAttribute('data-lights')).toBe('wilderness')
    expect(lights(container)).toEqual(['left', 'right'])
    expect(container.querySelectorAll('[data-light] svg[viewBox="0 -34 100 194"]')).toHaveLength(2)
    expect(source).toMatch(/\[data-lights='wilderness'\] \{[^}]*--flicker: flicker;/)
  })

  it('stands a sulphur vent either side under Toktz, its glow rising only from the lava', async () => {
    const container = await shown('tzhaar')
    expect(container.querySelector('.wall-lights')?.getAttribute('data-lights')).toBe('tzhaar')
    expect(lights(container)).toEqual(['left', 'right'])
    expect(container.querySelectorAll('[data-light] svg[viewBox="0 0 100 160"]')).toHaveLength(2)
    const glow = /\[data-lights='tzhaar'\] \.light \{([^}]*)\}/.exec(source)?.[1] ?? ''
    const mask = /mask-image: linear-gradient\(to bottom, black (\d+)%, transparent (\d+)%\)/.exec(
      glow,
    )
    expect(mask).not.toBeNull()
    expect(Number(mask![1])).toBeLessThan(50)
    expect(Number(mask![2]) - Number(mask![1])).toBeGreaterThan(10)
  })

  it('lays a fairy ring at its own size either side under Zanaris, with no light', async () => {
    const container = await shown('zanaris')
    expect(container.querySelector('.wall-lights')?.getAttribute('data-lights')).toBe('zanaris')
    expect(lights(container)).toEqual(['left', 'right'])
    const rings = [...container.querySelectorAll<HTMLImageElement>('[data-light] img.ring')]
    expect(rings.map((ring) => [ring.width, ring.height])).toEqual([
      [250, 127],
      [250, 127],
    ])
    expect(source).toMatch(/\[data-lights='zanaris'\] \.light \{\s*display: none;/)
  })

  it('keeps the left fairy ring on a phone, in the bottom corner, and only under Zanaris', () => {
    const phone = /@media \(max-width: 49\.99rem\) \{([\s\S]*?)\n {2}\}/.exec(source)?.[1] ?? ''
    expect(phone).toMatch(/\.wall-lights\[data-lights='zanaris'\] \{\s*display: block;/)
    expect(phone).toMatch(/\[data-lights='zanaris'\] \.fitting\.left \{[^}]*bottom: 0;/)
    expect(phone).toMatch(/\[data-lights='zanaris'\] \.fitting\.right \{\s*display: none;/)
    expect(phone).not.toMatch(/data-lights='(jolly|gauntlet|corrupted_gauntlet)'/)
  })

  it('gives each lantern its own glass, so the two drawings never share an id', async () => {
    const container = await shown('jolly')
    const ids = [...container.querySelectorAll('[id]')].map((el) => el.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it.each(['pollnivneach', 'party_room', 'jungle', 'morytania'])(
    'draws nothing under %s',
    async (theme) => {
      const container = await shown(theme)
      expect(container.querySelector('.wall-lights')).toBeNull()
    },
  )

  it('follows the theme as the player switches to it and away', async () => {
    const container = await shown('pollnivneach')
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
    document.documentElement.dataset.theme = 'party_room'
    await new Promise((settle) => setTimeout(settle))
    await tick()
    expect(container.querySelector('.wall-lights')).toBeNull()
  })

  it('hides the lights below 800px, where the stage fills the window, all but Zanaris', () => {
    const style = source.slice(source.indexOf('<style>')).replace(/\/\*[\s\S]*?\*\//g, '')
    expect(style).toMatch(/\.wall-lights \{[^}]*display: none;/)
    const shown = [...style.matchAll(/([^{}]+)\{\s*display: block;/g)].map((rule) =>
      rule[1]!.trim(),
    )
    expect(shown).toEqual(['.wall-lights', '.ring', ".wall-lights[data-lights='zanaris']"])
    expect(style).toMatch(
      /@media \(min-width: 50rem\) \{\s*\.wall-lights \{\s*display: block;\s*\}/,
    )
  })
})
