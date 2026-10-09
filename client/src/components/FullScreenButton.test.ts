/**
 * The full-screen button: offered on a touch device whose browser can do it, gone once
 * full screen is on, and absent where the browser cannot (iPhone) or the pointer is a mouse.
 */

import { fireEvent, render, screen } from '@testing-library/svelte'
import { afterEach, describe, expect, it, vi } from 'vitest'

import FullScreenButton from './FullScreenButton.svelte'

function device({ touch, api }: { touch: boolean; api: boolean }) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: touch && query === '(pointer: coarse)',
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
  const request = vi.fn(() => Promise.resolve())
  document.documentElement.requestFullscreen = api
    ? request
    : (undefined as unknown as typeof request)
  return request
}

function setFullscreenElement(element: Element | null) {
  Object.defineProperty(document, 'fullscreenElement', { value: element, configurable: true })
}

afterEach(() => {
  vi.unstubAllGlobals()
  setFullscreenElement(null)
})

describe('FullScreenButton', () => {
  it('asks the page for full screen when tapped', async () => {
    const request = device({ touch: true, api: true })
    render(FullScreenButton)
    await fireEvent.click(await screen.findByRole('button', { name: /full screen/i }))
    expect(request).toHaveBeenCalledOnce()
  })

  it('goes away once full screen is on, and returns when it ends', async () => {
    device({ touch: true, api: true })
    render(FullScreenButton)
    await screen.findByRole('button')
    setFullscreenElement(document.documentElement)
    document.dispatchEvent(new Event('fullscreenchange'))
    await vi.waitFor(() => expect(screen.queryByRole('button')).toBeNull())
    setFullscreenElement(null)
    document.dispatchEvent(new Event('fullscreenchange'))
    await vi.waitFor(() => expect(screen.getByRole('button')).toBeTruthy())
  })

  it('is absent where the browser has no Fullscreen API', () => {
    device({ touch: true, api: false })
    render(FullScreenButton)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('is absent with a mouse', () => {
    device({ touch: false, api: true })
    render(FullScreenButton)
    expect(screen.queryByRole('button')).toBeNull()
  })
})
