/**
 * The Party Room's floor is strewn while that theme is on, and only then, following
 * `data-theme` on <html> as the menu changes it.
 */

import { render } from '@testing-library/svelte'
import { tick } from 'svelte'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import PartyFloor from './PartyFloor.svelte'

describe('PartyFloor', () => {
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

  it('draws nothing under another theme', async () => {
    document.documentElement.dataset.theme = 'jolly'
    const { container } = render(PartyFloor)
    await tick()
    expect(container.querySelector('.party-floor')).toBeNull()
  })

  it('strews balloons and partyhats under party_room, hidden from screen readers', async () => {
    document.documentElement.dataset.theme = 'party_room'
    const { container } = render(PartyFloor)
    await tick()
    await tick()
    expect(container.querySelector('.party-floor')?.getAttribute('aria-hidden')).toBe('true')
    expect(drops(container, 'balloon')).toBeGreaterThan(100)
    expect(drops(container, 'hat')).toBeGreaterThan(10)
  })

  it('follows the theme as the player switches to it and away', async () => {
    document.documentElement.dataset.theme = 'wilderness'
    const { container } = render(PartyFloor)
    document.documentElement.dataset.theme = 'party_room'
    await new Promise((settle) => setTimeout(settle))
    await tick()
    expect(drops(container, 'balloon')).toBeGreaterThan(0)
    document.documentElement.dataset.theme = 'pollnivneach'
    await new Promise((settle) => setTimeout(settle))
    await tick()
    expect(container.querySelector('.party-floor')).toBeNull()
  })
})
