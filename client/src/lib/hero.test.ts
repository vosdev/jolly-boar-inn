/** Who hosts Home and the lobby, and what the dialogue box calls them. */

import { describe, expect, it, vi } from 'vitest'

const branding = vi.hoisted(() => ({
  siteName: 'The Dancing Donkey',
  hero: '/assets/hero.svg' as string | null,
  heroes: { tzhaar: '/assets/hero-tzhaar.svg' } as Record<string, string>,
  heroName: '',
}))

vi.mock('virtual:branding', () => ({
  get siteName() {
    return branding.siteName
  },
  get hero() {
    return branding.hero
  },
  get heroes() {
    return branding.heroes
  },
  get heroName() {
    return branding.heroName
  },
}))

import { heroFor, speakerFor } from './hero'

describe('heroFor', () => {
  it("is the theme's own hero, else the hero, else nobody", () => {
    expect(heroFor('tzhaar')).toBe('/assets/hero-tzhaar.svg')
    expect(heroFor('jolly')).toBe('/assets/hero.svg')
    branding.hero = null
    expect(heroFor('jolly')).toBeNull()
    branding.hero = '/assets/hero.svg'
  })
})

describe('speakerFor', () => {
  it("is the hero's name when one is set", () => {
    branding.heroName = 'Broav'
    expect(speakerFor('/assets/hero.svg')).toBe('Broav')
    branding.heroName = ''
  })

  it("is the site's name for a hero with no name", () => {
    expect(speakerFor('/assets/hero.svg')).toBe('The Dancing Donkey')
  })

  it('is the Wise Old Man without a hero, whatever the hero would be called', () => {
    branding.heroName = 'Broav'
    expect(speakerFor(null)).toBe('Wise Old Man')
    branding.heroName = ''
  })
})
