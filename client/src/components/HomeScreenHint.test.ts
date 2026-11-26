/**
 * The Home Screen hint: on an iPhone, where no Full screen switch is offered, until the game
 * runs from the Home Screen or the player dismisses it for good.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import HomeScreenHint from './HomeScreenHint.svelte'

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
const ANDROID =
  'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36'

function device({
  agent,
  api = false,
  installed = false,
}: {
  agent: string
  api?: boolean
  installed?: boolean
}) {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(agent)
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: installed && query === '(display-mode: standalone)',
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
  document.documentElement.requestFullscreen = api
    ? () => Promise.resolve()
    : (undefined as unknown as () => Promise<void>)
}

const summary = () => screen.queryByText('Full screen: add to Home Screen')

beforeEach(() => localStorage.clear())

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('HomeScreenHint', () => {
  it('points an iPhone to the Home Screen', () => {
    device({ agent: IPHONE })
    render(HomeScreenHint)
    expect(summary()).not.toBeNull()
    expect(screen.getByText(/Tap Share, then Add to Home Screen/)).toBeTruthy()
  })

  it('is not there where full screen works, or off an iPhone', () => {
    device({ agent: IPHONE, api: true })
    render(HomeScreenHint)
    expect(summary()).toBeNull()
    cleanup()
    device({ agent: ANDROID })
    render(HomeScreenHint)
    expect(summary()).toBeNull()
  })

  it('is not there once the game runs from the Home Screen', () => {
    device({ agent: IPHONE, installed: true })
    render(HomeScreenHint)
    expect(summary()).toBeNull()
  })

  it('stays gone once dismissed, in this room and the next', async () => {
    device({ agent: IPHONE })
    render(HomeScreenHint)
    await fireEvent.click(screen.getByRole('button', { name: "Don't show this again" }))
    expect(summary()).toBeNull()
    cleanup()
    render(HomeScreenHint)
    expect(summary()).toBeNull()
  })
})
