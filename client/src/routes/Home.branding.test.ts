/**
 * Home under the owner's branding: a hero on the stage in place of the Wise Old Man, the
 * theme's own where there is one. `Home.test.ts` has the stock inn, where he still hosts.
 */

import { render, waitFor } from '@testing-library/svelte'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as api from '../lib/api'
import Home from './Home.svelte'

vi.mock('virtual:branding', () => ({
  siteName: 'The Jolly Boar Inn',
  initial: 'J',
  logo: '/assets/logo-abc123.svg',
  logos: {},
  favicons: {},
  hero: '/assets/hero-abc123.svg',
  heroes: { tzhaar: '/assets/hero-tzhaar-def456.svg' },
  heroName: 'Broav',
  defaultTheme: '',
}))

vi.mock('../lib/api', async (importOriginal) => {
  const real = await importOriginal<typeof import('../lib/api')>()
  return { ...real, getPublicRooms: vi.fn(), getRoom: vi.fn(), deleteRoom: vi.fn() }
})

beforeEach(() => {
  vi.mocked(api.getPublicRooms).mockResolvedValue([])
  document.documentElement.dataset.theme = 'jolly'
})

const stageArt = () =>
  [...document.querySelectorAll('.stage .npc img')].map((img) => img.getAttribute('src'))

describe('Home, with a hero', () => {
  it('puts the hero on the stage instead of the Wise Old Man', () => {
    render(Home, { navigate: vi.fn() })
    expect(stageArt()).toEqual(['/assets/hero-abc123.svg'])
  })

  it('swaps in the theme’s own hero, and back to the hero in a theme without one', async () => {
    render(Home, { navigate: vi.fn() })
    document.documentElement.dataset.theme = 'tzhaar'
    await waitFor(() => expect(stageArt()).toEqual(['/assets/hero-tzhaar-def456.svg']))
    document.documentElement.dataset.theme = 'wilderness'
    await waitFor(() => expect(stageArt()).toEqual(['/assets/hero-abc123.svg']))
  })
})
