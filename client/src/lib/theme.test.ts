/** The switch: `data-theme` on <html>, and the tab icon with it. */

import { favicons } from 'virtual:branding'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { applyTheme, DEFAULT_THEME, getTheme, storedTheme } from './theme'

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

describe('getTheme', () => {
  afterEach(() => localStorage.clear())

  it.each(['gauntlet', 'corrupted_gauntlet'])(
    'gives a browser that stored the retired %s theme the default',
    (retired) => {
      localStorage.setItem('jbi:theme', retired)
      expect(storedTheme()).toBeNull()
      expect(getTheme()).toBe(DEFAULT_THEME)
    },
  )

  it('keeps a browser that picked Prifddinas in it', () => {
    localStorage.setItem('jbi:theme', 'prifddinas')
    expect(getTheme()).toBe('prifddinas')
  })
})
