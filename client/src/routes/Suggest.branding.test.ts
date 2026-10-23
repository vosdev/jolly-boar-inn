/** `/suggest` under the owner's branding: the hero is the face of the "Not sure" card. */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as api from '../lib/api'
import { savePastGame } from '../lib/history'
import Suggest from './Suggest.svelte'

vi.mock('virtual:branding', () => ({
  siteName: 'The Jolly Boar Inn',
  initial: 'J',
  logo: null,
  logos: {},
  favicons: {},
  hero: '/assets/hero-abc123.svg',
  heroes: { tzhaar: '/assets/hero-tzhaar-def456.svg' },
  defaultTheme: '',
}))

vi.mock('../lib/api', async (importOriginal) => {
  const real = await importOriginal<typeof import('../lib/api')>()
  return { ...real, getSuggestionAllowance: vi.fn(), findSimilar: vi.fn() }
})

beforeEach(() => {
  localStorage.clear()
  savePastGame({ code: 'ABYSSAL', finishedAt: '2026-10-01T20:05:00Z', standings: [], youId: null })
  vi.mocked(api.getSuggestionAllowance).mockResolvedValue({ left: 10, retry_at: null })
  vi.mocked(api.findSimilar).mockResolvedValue([])
  document.documentElement.dataset.theme = 'jolly'
})

afterEach(cleanup)

const lastCardArt = async () => {
  const cards = (await screen.findAllByRole('button')).filter((b) => b.closest('.choices'))
  return cards.at(-1)?.querySelector('img')?.getAttribute('src')
}

describe('Suggest, with a hero', () => {
  it('shows the hero on the card with no round, the theme’s own where there is one', async () => {
    render(Suggest, { navigate: vi.fn() })
    expect(await lastCardArt()).toBe('/assets/hero-abc123.svg')
    document.documentElement.dataset.theme = 'tzhaar'
    await waitFor(async () => expect(await lastCardArt()).toBe('/assets/hero-tzhaar-def456.svg'))
  })

  it('stands the hero on the preview of a question with no round, its question on the scroll', async () => {
    render(Suggest, { navigate: vi.fn() })
    const cards = (await screen.findAllByRole('button')).filter((b) => b.closest('.choices'))
    await fireEvent.click(cards.at(-1)!)
    const prompt = screen.getByLabelText('Question', { selector: 'textarea' })
    await fireEvent.input(prompt, { target: { value: 'Which god is Saradomin’s rival?' } })
    const preview = screen.getByRole('region', { name: 'Preview' })
    expect(preview.querySelector('.npc.host img')?.getAttribute('src')).toBe(
      '/assets/hero-abc123.svg',
    )
    expect(preview.querySelector('.stage-row')?.textContent).toContain(
      'Which god is Saradomin’s rival?',
    )
  })
})
