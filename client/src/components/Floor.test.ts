/**
 * A theme's floor is strewn while that theme is on, and only then, following `data-theme`
 * on <html> as the menu changes it.
 */

import { render } from '@testing-library/svelte'
import { tick } from 'svelte'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import Floor from './Floor.svelte'

describe('Floor', () => {
  beforeEach(() => {
    // jsdom lays nothing out; the floor needs a size to scatter across.
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get: () => 1280,
    })
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
      configurable: true,
      get: () => 1920,
    })
  })

  afterEach(() => {
    delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth
    delete (HTMLElement.prototype as { clientHeight?: number }).clientHeight
    delete document.documentElement.dataset.theme
  })

  const drops = (container: HTMLElement, kind: string): number =>
    container.querySelectorAll(`[data-drop="${kind}"]`).length

  const settle = async (): Promise<void> => {
    await new Promise((done) => setTimeout(done))
    await tick()
  }

  it('draws nothing under another theme', async () => {
    document.documentElement.dataset.theme = 'jolly'
    const { container } = render(Floor)
    await tick()
    expect(container.querySelector('.floor')).toBeNull()
  })

  it.each([
    ['party_room', ['balloon', 'hat'], 100],
    ['jungle', ['banana', 'monkey_nuts'], 100],
    ['pollnivneach', ['camel', 'waterskin'], 25],
  ])('strews the %s floor, hidden from screen readers', async (theme, kinds, least) => {
    document.documentElement.dataset.theme = theme
    const { container } = render(Floor)
    await tick()
    await tick()
    expect(container.querySelector('.floor')?.getAttribute('aria-hidden')).toBe('true')
    expect(container.querySelectorAll('[data-drop]').length).toBeGreaterThan(least)
    for (const kind of kinds) expect(drops(container, kind)).toBeGreaterThan(0)
  })

  it('draws the game sprites as images, never with styles', async () => {
    document.documentElement.dataset.theme = 'jungle'
    const { container } = render(Floor)
    await tick()
    await tick()
    const images = container.querySelectorAll('image')
    expect(images.length).toBeGreaterThan(0)
    for (const image of images) expect(image.getAttribute('href')).toBeTruthy()
    expect(container.querySelector('[style]')).toBeNull()
  })

  it('follows the theme as the player switches between floors and away', async () => {
    document.documentElement.dataset.theme = 'wilderness'
    const { container } = render(Floor)
    document.documentElement.dataset.theme = 'party_room'
    await settle()
    expect(drops(container, 'balloon')).toBeGreaterThan(0)
    document.documentElement.dataset.theme = 'jungle'
    await settle()
    expect(drops(container, 'balloon')).toBe(0)
    expect(drops(container, 'banana')).toBeGreaterThan(0)
    document.documentElement.dataset.theme = 'pollnivneach'
    await settle()
    expect(drops(container, 'banana')).toBe(0)
    expect(drops(container, 'camel')).toBeGreaterThan(0)
    document.documentElement.dataset.theme = 'tzhaar'
    await settle()
    expect(container.querySelector('.floor')).toBeNull()
  })
})
