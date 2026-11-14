/** What's new is fetched on the first tap, so a failed fetch must not lock it shut. */

import { fireEvent, render, screen } from '@testing-library/svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { VERSION_LABEL } from '../lib/links'
import Footer from './Footer.svelte'

const fetches = vi.hoisted(() => ({ failed: 0 }))

vi.mock('./Changelog.svelte', async (importOriginal) => {
  if (fetches.failed === 0) {
    fetches.failed += 1
    throw new TypeError('Failed to fetch dynamically imported module')
  }
  return importOriginal()
})

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => new Promise(() => {})),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("Footer's What's new", () => {
  it('says a failed fetch failed, and opens on the next tap', async () => {
    render(Footer)
    const open = screen.getByRole('button', { name: `What's new in v${VERSION_LABEL}` })
    await fireEvent.click(open)
    expect(await screen.findByText("What's new didn't load.")).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
    await fireEvent.click(open)
    expect(await screen.findByRole('dialog', { name: "What's new" })).toBeTruthy()
    expect(screen.queryByText("What's new didn't load.")).toBeNull()
  })
})
