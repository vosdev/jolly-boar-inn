/** The switch: `data-theme` on <html>, and the tab icon with it. */

import { favicons } from 'virtual:branding'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { applyTheme } from './theme'

let icon: HTMLLinkElement

beforeEach(() => {
  icon = document.createElement('link')
  icon.rel = 'icon'
  icon.href = favicons.jolly!.href
  document.head.append(icon)
})

afterEach(() => icon.remove())

describe('applyTheme', () => {
  it('repaints the page and swaps the tab icon for the theme’s', () => {
    applyTheme('tzhaar')
    expect(document.documentElement.dataset.theme).toBe('tzhaar')
    expect(icon.getAttribute('href')).toBe(favicons.tzhaar!.href)
    expect(favicons.tzhaar!.href).not.toBe(favicons.jolly!.href)

    applyTheme('jolly')
    expect(icon.getAttribute('href')).toBe(favicons.jolly!.href)
  })
})
