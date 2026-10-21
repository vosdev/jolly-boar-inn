/** The band under every screen: the notices a visitor is owed, and the way to the code. */

import { fireEvent, render, screen } from '@testing-library/svelte'
import { tick } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { asOfDate } from '../lib/dates'
import { VERSION_LABEL } from '../lib/links'
import { pricesAsOf } from '../lib/pricesAsOf.svelte'
import Footer from './Footer.svelte'

beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal(
    'fetch',
    vi.fn(() => new Promise(() => {})),
  )
})

afterEach(() => {
  pricesAsOf.byMode = {}
  vi.unstubAllGlobals()
})

describe('Footer', () => {
  it('says what is counted and that no cookies are used', () => {
    render(Footer)
    expect(
      screen.getByText('We count games and rounds per day. No cookies, no personal data.'),
    ).toBeTruthy()
  })

  it('shows the GitHub mark beside the link to the code', () => {
    render(Footer)
    const link = screen.getByRole('link', { name: 'Source on GitHub' })
    expect(link.querySelector('svg')).not.toBeNull()
  })

  it('links the credits page in a new tab', () => {
    render(Footer)
    const link = screen.getByRole('link', { name: 'Credits' })
    expect(link.getAttribute('href')).toBe('/credits')
    expect(link.getAttribute('target')).toBe('_blank')
  })

  it("opens What's new from the version, and closes it again", async () => {
    render(Footer)
    expect(screen.queryByRole('dialog')).toBeNull()
    await fireEvent.click(screen.getByRole('button', { name: `What's new in v${VERSION_LABEL}` }))
    expect(screen.getByRole('dialog', { name: "What's new" })).toBeTruthy()
    await fireEvent.click(screen.getByRole('button', { name: 'Got it' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it("dates the Grand Exchange prices by the newest price mode's", async () => {
    render(Footer)
    expect(document.body.textContent).not.toContain('GE prices')
    pricesAsOf.byMode = { more_less: '2026-09-01', price_is_right: '2026-10-08' }
    await tick()
    expect(screen.getByText(`GE prices as of ${asOfDate('2026-10-08')}`)).toBeTruthy()
  })
})
