/** The band under every screen: the notices a visitor is owed, and the way to the code. */

import { fireEvent, render, screen } from '@testing-library/svelte'
import { tick } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { asOfDate } from '../lib/dates'
import { DISCORD_URL, VERSION_LABEL } from '../lib/links'
import { pricesAsOf } from '../lib/pricesAsOf.svelte'
import { questionCounts } from '../lib/questionCounts.svelte'
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
  questionCounts.counts = null
  vi.unstubAllGlobals()
})

/** The control a modal focuses on opening, which the browser scrolls into view. */
function firstControl(dialog: HTMLElement): Element | null {
  return dialog.querySelector('a[href], button, input, select, textarea, [tabindex]')
}

describe('Footer', () => {
  it('says what is counted and that no cookies are used', () => {
    render(Footer)
    expect(
      screen.getByText(
        'We only count games and rounds played per day. No cookies, no personal data.',
      ),
    ).toBeTruthy()
  })

  it('shows the GitHub mark beside the link to the code', () => {
    render(Footer)
    const link = screen.getByRole('link', { name: 'Source on GitHub' })
    expect(link.querySelector('svg')).not.toBeNull()
  })

  it('links the Discord in a new tab', () => {
    render(Footer)
    const link = screen.getByRole('link', { name: 'Discord' })
    expect(link.getAttribute('href')).toBe(DISCORD_URL)
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
  })

  it('opens the credits on every screen, and closes them again', async () => {
    render(Footer)
    await fireEvent.click(screen.getByRole('button', { name: 'Credits' }))
    expect(screen.getByRole('dialog', { name: 'Credits' })).toBeTruthy()
    await fireEvent.click(screen.getAllByRole('button', { name: 'Close' }).at(-1)!)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it("opens What's new from the version, and closes it again", async () => {
    render(Footer)
    expect(screen.queryByRole('dialog')).toBeNull()
    await fireEvent.click(screen.getByRole('button', { name: `What's new in v${VERSION_LABEL}` }))
    expect(await screen.findByRole('dialog', { name: "What's new" })).toBeTruthy()
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

  it('counts every question, and opens them per round and per NPC', async () => {
    render(Footer)
    expect(document.body.textContent).not.toContain('questions and counting')
    questionCounts.counts = {
      modes: { bestiary: 1200, odd_one_out: 34 },
      random_events: { bob: 10, death: 334 },
    }
    await tick()
    await fireEvent.click(screen.getByRole('button', { name: '1,578 questions and counting' }))
    expect(screen.getByRole('dialog', { name: '1,578 questions' })).toBeTruthy()
    await fireEvent.click(screen.getAllByRole('button', { name: 'Close' }).at(-1)!)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it.each([
    ['questions and counting', '1,578 questions'],
    ['Credits', 'Credits'],
    [`What's new in v${VERSION_LABEL}`, "What's new"],
  ])('opens the %s sheet on a close X at its top', async (button, title) => {
    questionCounts.counts = { modes: { bestiary: 1578 }, random_events: {} }
    render(Footer)
    await tick()
    await fireEvent.click(screen.getByRole('button', { name: new RegExp(button) }))
    const dialog = await screen.findByRole('dialog', { name: title })
    const closeX = screen.getAllByRole('button', { name: 'Close' })[0]!
    expect(firstControl(dialog)).toBe(closeX)
    await fireEvent.click(closeX)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
