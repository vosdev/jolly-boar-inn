/** `/admin`: what an operator sees, and what a refused or missing token gets. */

import { render, screen, waitFor, within } from '@testing-library/svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Count, Live } from '../lib/admin'
import Admin from './Admin.svelte'

const TOKEN = '0123456789abcdef0123456789abcdef'
const SOON = new Date(Date.now() + 41 * 60_000 + 30_000).toISOString()

const LIVE: Live = {
  sockets: 3,
  rooms: [
    {
      code: 'HADDOCK',
      status: 'playing',
      round: { index: 1, total: 4, mode: 'price_is_right' },
      connected: 2,
      players: 3,
      waiting: false,
      created_at: '2026-10-01T12:02:00Z',
      deletes_at: SOON,
    },
    {
      code: 'MITHRIL',
      status: 'playing',
      round: { index: 0, total: 2, mode: 'more_less' },
      connected: 0,
      players: 2,
      waiting: true,
      created_at: '2026-10-01T11:00:00Z',
      deletes_at: SOON,
    },
  ],
}

const today = new Date().toISOString().slice(0, 10)
const COUNTS: Count[] = [
  { day: today, metric: 'games_finished', key: '', count: 4 },
  { day: today, metric: 'rounds_started', key: 'guess_examine', count: 6 },
  { day: today, metric: 'rounds_finished', key: 'guess_examine', count: 5 },
  { day: today, metric: 'rounds_started', key: 'more_less', count: 2 },
]

function serve(status = 200): ReturnType<typeof vi.fn> {
  const fetch = vi.fn(async (url: string) =>
    status !== 200
      ? new Response('{}', { status })
      : new Response(JSON.stringify(url.endsWith('/rooms') ? LIVE : { counts: COUNTS })),
  )
  vi.stubGlobal('fetch', fetch)
  return fetch
}

beforeEach(() => {
  localStorage.clear()
  history.replaceState(null, '', `/admin#token=${TOKEN}`)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Admin', () => {
  it('lists the live rooms and the totals', async () => {
    serve()
    render(Admin)
    const table = await screen.findByRole('table')
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows.map((r) => r.querySelector('td')?.textContent)).toEqual(['HADDOCK', 'MITHRIL'])
    expect(rows[0]?.textContent).toContain('2 / 4 · The Price is Right')
    expect(rows[0]?.textContent).toContain('2 / 3')
    expect(rows[0]?.textContent).toContain('41 min')
    expect(rows[1]?.textContent).toContain('waiting')
    const tiles = screen.getByText('Open sockets').parentElement!
    expect(tiles.textContent).toContain('3')
    expect(screen.getByText('Players connected').parentElement!.textContent).toContain('2 / 5')
    expect(location.hash).toBe('')
  })

  it('charts the history and ranks the modes', async () => {
    serve()
    render(Admin)
    expect(await screen.findByText('Games per day, by how they ended')).toBeTruthy()
    expect(screen.getByRole('img', { name: /4 finished/ })).toBeTruthy()
    const modes = [...document.querySelectorAll('.ranking .mode')].map((m) => m.textContent)
    expect(modes).toEqual(['Guess the Examine', 'More or Less'])
  })

  it('forgets a refused token and says so', async () => {
    serve(401)
    render(Admin)
    expect(await screen.findByText('That admin token was refused.')).toBeTruthy()
    expect(localStorage.getItem('jbi:admin')).toBeNull()
  })

  it('asks nothing without a token', () => {
    history.replaceState(null, '', '/admin')
    const fetch = serve()
    render(Admin)
    expect(screen.getByText('That admin token was refused.')).toBeTruthy()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('is not found on a server without the admin view', async () => {
    serve(404)
    render(Admin)
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Not found'))
  })
})
