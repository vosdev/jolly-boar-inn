/**
 * The full-screen switch: offered on a touch device whose browser can do it, on while full
 * screen is, and absent where the browser cannot (iPhone) or the pointer is a mouse.
 */

import { fireEvent, render, screen } from '@testing-library/svelte'
import { afterEach, describe, expect, it, vi } from 'vitest'

import FullScreenSwitch from './FullScreenSwitch.svelte'

const exit = vi.fn(() => Promise.resolve())

function device({ touch, api }: { touch: boolean; api: boolean }) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: touch && query === '(pointer: coarse)',
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
  const request = vi.fn(() => Promise.resolve())
  document.exitFullscreen = exit
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

const toggle = () => screen.findByRole('switch', { name: 'Full screen' })

describe('FullScreenSwitch', () => {
  it('is off to begin with, and asks the page for full screen when flipped', async () => {
    const request = device({ touch: true, api: true })
    render(FullScreenSwitch)
    const control = await toggle()
    expect(control.getAttribute('aria-checked')).toBe('false')
    await fireEvent.click(control)
    expect(request).toHaveBeenCalledOnce()
  })

  it('turns on with the browser, and leaves full screen when flipped back', async () => {
    device({ touch: true, api: true })
    render(FullScreenSwitch)
    const control = await toggle()
    setFullscreenElement(document.documentElement)
    document.dispatchEvent(new Event('fullscreenchange'))
    await vi.waitFor(() => expect(control.getAttribute('aria-checked')).toBe('true'))
    await fireEvent.click(control)
    expect(exit).toHaveBeenCalledOnce()
    setFullscreenElement(null)
    document.dispatchEvent(new Event('fullscreenchange'))
    await vi.waitFor(() => expect(control.getAttribute('aria-checked')).toBe('false'))
  })

  it('is absent where the browser has no Fullscreen API', () => {
    device({ touch: true, api: false })
    render(FullScreenSwitch)
    expect(screen.queryByRole('switch')).toBeNull()
  })

  it('is absent with a mouse', () => {
    device({ touch: false, api: true })
    render(FullScreenSwitch)
    expect(screen.queryByRole('switch')).toBeNull()
  })

  it('is offered with a mouse too in a short room, with a line saying why', async () => {
    device({ touch: false, api: true })
    render(FullScreenSwitch, { short: true })
    expect(await toggle()).toBeTruthy()
    expect(screen.getByText('Short on room? Full screen shows the whole question.')).toBeTruthy()
  })

  it('says nothing in a short room where the browser has no Fullscreen API', () => {
    device({ touch: true, api: false })
    render(FullScreenSwitch, { short: true })
    expect(screen.queryByText(/Short on room/)).toBeNull()
  })
})
