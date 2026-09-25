/**
 * The shell around every screen: one bar above whatever the route draws, with no room
 * code in it, a way past it, a sign that goes home, and a first visit that can join and
 * play with storage that throws.
 */

import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import App from './App.svelte'
import * as api from './lib/api'
import { profile } from './lib/profile'

vi.mock('./lib/api', async (importOriginal) => {
  const real = await importOriginal<typeof import('./lib/api')>()
  return { ...real, getModes: vi.fn(), getRoom: vi.fn(), joinRoom: vi.fn() }
})

vi.mock('./lib/ws', () => ({
  RoomSocket: class {
    open(): void {}
    close(): void {}
    send(): boolean {
      return true
    }
  },
}))

const bar = () => document.querySelector('header')!

function at(path: string): void {
  history.replaceState(null, '', path)
  render(App)
}

/** One bar, before the screen, and no room code in it. */
function underOneBar(): void {
  expect(document.querySelectorAll('header')).toHaveLength(1)
  const main = document.querySelector('main')!
  expect(bar().compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(bar().textContent).not.toContain('ABYSSAL')
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  profile.set({ name: 'Zezima', head: 3 })
  vi.mocked(api.getModes).mockResolvedValue([])
  vi.mocked(api.getRoom).mockResolvedValue({ status: 'lobby', players: 2 })
  vi.mocked(api.joinRoom).mockResolvedValue({
    session: 'token',
    player: { id: 'a', display_name: 'Zezima', role: 'player', connected: true },
  })
})

afterEach(() => vi.restoreAllMocks())

describe('App', () => {
  it.each([['/'], ['/create']])('draws %s under the one bar', async (path) => {
    at(path)
    await screen.findByRole('heading', { level: 1 })
    underOneBar()
  })

  it('draws Join and then the room under the one bar, and the bar never names the room', async () => {
    at('/r/ABYSSAL')
    expect(screen.getByRole('heading', { level: 1, name: 'Room ABYSSAL' })).toBeTruthy()
    underOneBar()
    expect(await screen.findByText('Connecting…')).toBeTruthy()
    underOneBar()
  })

  it('fills the theme slot with the picker and the identity slot with the chip', () => {
    at('/')
    expect(within(bar()).getByRole('button', { name: /^Theme: / })).toBeTruthy()
    expect(within(bar()).getByRole('button', { name: /^You are Zezima/ })).toBeTruthy()
  })

  it('lets the keyboard skip the bar to the screen', () => {
    at('/')
    const skip = within(bar()).getByRole('link', { name: 'Skip to the game' })
    const target = document.getElementById(skip.getAttribute('href')!.slice(1))
    expect(target?.tagName).toBe('MAIN')
    expect(within(target!).getByRole('heading', { level: 1 })).toBeTruthy()
  })

  it('goes home from the sign', async () => {
    at('/create')
    await fireEvent.click(within(bar()).getByRole('link', { name: /, home$/ }))
    expect(location.pathname).toBe('/')
    expect(screen.getByRole('heading', { level: 1, name: 'Welcome in' })).toBeTruthy()
  })

  it('with storage throwing, lets a first visit join a room and play in it', async () => {
    const denied = (): never => {
      throw new DOMException('The operation is insecure.', 'SecurityError')
    }
    for (const method of ['getItem', 'setItem', 'removeItem'] as const) {
      vi.spyOn(Storage.prototype, method).mockImplementation(denied)
    }
    profile.set(null)
    at('/r/CABBAGE')
    await waitFor(() => expect(api.joinRoom).toHaveBeenCalledOnce())
    expect(await screen.findByText('Connecting…')).toBeTruthy()
    expect(within(bar()).getByRole('button', { name: /^You are / })).toBeTruthy()
  })
})
