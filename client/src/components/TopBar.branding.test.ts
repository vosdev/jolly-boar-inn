/**
 * The bar and the default theme under a selfhoster's branding: their own name, their own
 * logo, and the bundled sign back when that logo will not load.
 */

import { fireEvent, render, screen } from '@testing-library/svelte'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { getTheme, pickDefault } from '../lib/theme'
import TopBar from './TopBar.svelte'

vi.mock('virtual:branding', () => ({
  siteName: 'The Dancing Donkey',
  initial: 'D',
  logo: '/assets/logo-abc123.png',
  defaultTheme: 'wilderness',
}))

beforeEach(() => localStorage.clear())

describe('TopBar, branded', () => {
  it('shows the instance its own name and logo', () => {
    render(TopBar, { navigate: vi.fn() })
    expect(screen.getByRole('link', { name: 'The Dancing Donkey, home' })).toBeTruthy()
    expect(document.querySelector('.wordmark')!.textContent!.trim()).toBe('The Dancing Donkey')
    expect(document.querySelector('header img')!.getAttribute('src')).toBe(
      '/assets/logo-abc123.png',
    )
    expect(document.querySelector('.sign-letter')).toBeNull()
  })

  it('falls back to the bundled sign when the logo does not load', async () => {
    render(TopBar, { navigate: vi.fn() })
    await fireEvent.error(document.querySelector('header img')!)
    expect(document.querySelector('header img')).toBeNull()
    expect(document.querySelector('.sign-letter')!.textContent!.trim()).toBe('D')
  })
})

describe('default theme, branded', () => {
  it('paints the configured theme for a browser that never chose', () => {
    expect(getTheme()).toBe('wilderness')
  })

  it('still paints what a browser chose over the configured default', () => {
    localStorage.setItem('jbi:theme', 'pollnivneach')
    expect(getTheme()).toBe('pollnivneach')
  })

  it('falls back to jolly for a theme this build does not paint', () => {
    expect(pickDefault('party_hat')).toBe('jolly')
    expect(pickDefault('')).toBe('jolly')
    expect(pickDefault('pollnivneach')).toBe('pollnivneach')
  })
})
