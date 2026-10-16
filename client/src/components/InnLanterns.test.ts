/**
 * The inn's two wall lanterns are lit while the Jolly theme is on, and only then, following
 * `data-theme` on <html> as the menu changes it.
 */

import { render } from '@testing-library/svelte'
import { tick } from 'svelte'
import { afterEach, describe, expect, it } from 'vitest'

import InnLanterns from './InnLanterns.svelte'

describe('InnLanterns', () => {
  afterEach(() => {
    delete document.documentElement.dataset.theme
  })

  const lanterns = (container: HTMLElement): string[] =>
    [...container.querySelectorAll('[data-lantern]')].map((l) => l.getAttribute('data-lantern') ?? '')

  it('hangs a lantern either side under jolly, hidden from screen readers', async () => {
    document.documentElement.dataset.theme = 'jolly'
    const { container } = render(InnLanterns)
    await tick()
    expect(container.querySelector('.inn-lanterns')?.getAttribute('aria-hidden')).toBe('true')
    expect(lanterns(container)).toEqual(['left', 'right'])
  })

  it('gives each lantern its own glass, so the two drawings never share an id', async () => {
    document.documentElement.dataset.theme = 'jolly'
    const { container } = render(InnLanterns)
    await tick()
    const ids = [...container.querySelectorAll('[id]')].map((el) => el.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('draws nothing under another theme', async () => {
    document.documentElement.dataset.theme = 'party_room'
    const { container } = render(InnLanterns)
    await tick()
    expect(container.querySelector('.inn-lanterns')).toBeNull()
  })

  it('follows the theme as the player switches to it and away', async () => {
    document.documentElement.dataset.theme = 'wilderness'
    const { container } = render(InnLanterns)
    document.documentElement.dataset.theme = 'jolly'
    await new Promise((settle) => setTimeout(settle))
    await tick()
    expect(lanterns(container)).toHaveLength(2)
    document.documentElement.dataset.theme = 'tzhaar'
    await new Promise((settle) => setTimeout(settle))
    await tick()
    expect(container.querySelector('.inn-lanterns')).toBeNull()
  })
})
