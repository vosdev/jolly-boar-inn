/** `/admin`: what an operator sees, and what a refused or missing token gets. */

import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte'
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
  { day: today, metric: 'questions_all_answered', key: 'more_less', count: 7 },
  { day: today, metric: 'questions_skipped', key: 'more_less', count: 1 },
  { day: today, metric: 'join_failures', key: 'not_found', count: 3 },
  { day: today, metric: 'themes', key: 'tzhaar', count: 2 },
  { day: today, metric: 'game_durations', key: '60+', count: 1 },
  { day: today, metric: 'game_durations', key: '10-20', count: 2 },
  { day: today, metric: 'custom_questions', key: 'free_text', count: 4 },
  { day: today, metric: 'games_with_custom', key: '', count: 1 },
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
  it('heads a panel, its refresh button counting the seconds since the last fetch', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
    try {
      serve()
      render(Admin)
      const refresh = await screen.findByRole('button', { name: 'Refresh · 0s ago' })
      expect(screen.getByRole('heading', { level: 1, name: 'Admin' }).closest('.panel')).toBe(
        refresh.closest('.panel'),
      )
      await vi.advanceTimersByTimeAsync(3_000)
      expect(refresh.textContent).toBe('Refresh · 3s ago')
    } finally {
      vi.useRealTimers()
    }
  })

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

  it('breaks the new counters down, each under its own name', async () => {
    serve()
    render(Admin)
    await screen.findByText('How questions closed, by mode')
    const rows = (title: string) =>
      [...screen.getByText(title).closest('section')!.querySelectorAll('li .label')].map(
        (label) => label.textContent,
      )
    expect(rows('How questions closed, by mode')).toEqual(['More or Less'])
    expect(screen.getByText('(7 / 0 / 1)')).toBeTruthy()
    expect(rows('Join failures players saw')).toEqual(['Unknown code'])
    expect(rows('Themes picked, once per browser')).toEqual(['Toktz'])
    expect(rows('Finished games by length')).toEqual(['10–20 min', '60+ min'])
    expect(rows("Hosts' own questions by type")).toEqual(['Type the answer'])
    expect(screen.getByText('In 1 game started.')).toBeTruthy()
    expect(rows('How players got in')).toEqual([])
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

  it('opens on the overview, tabs badged with what waits in each queue', async () => {
    const fetch = vi.fn(async (url: string) => {
      if (url.endsWith('/rooms')) return new Response(JSON.stringify(LIVE))
      if (url.includes('/suggestions')) {
        const counts = { pending: 3, approved: 0, rejected: 0, imported: 0 }
        return new Response(JSON.stringify({ suggestions: [], counts }))
      }
      if (url.includes('/reports')) {
        return new Response(JSON.stringify({ reports: [], counts: { open: 0, closed: 2 } }))
      }
      return new Response(JSON.stringify({ counts: COUNTS }))
    })
    vi.stubGlobal('fetch', fetch)
    render(Admin)
    const nav = await screen.findByRole('navigation', { name: 'Admin' })
    const current = within(nav).getByRole('link', { current: 'page' })
    expect(current.textContent?.trim()).toBe('Overview')
    await waitFor(() =>
      expect(within(nav).getByRole('link', { name: /Suggestions/ }).textContent).toContain('3'),
    )
    expect(within(nav).getByRole('link', { name: /Reports/ }).querySelector('.badge')).toBeNull()
    expect(within(nav).getByRole('link', { name: /Questions/ }).getAttribute('href')).toBe('/admin/questions')
    expect(within(nav).getByRole('link', { name: /Roster/ }).getAttribute('href')).toBe('/admin/roster')
  })

  it('moves between tabs by path, refreshing the rooms on the overview alone', async () => {
    const fetch = vi.fn(async (url: string) => {
      if (url.endsWith('/question-changes')) return new Response(JSON.stringify({ changes: [] }))
      if (url.endsWith('/questions/modes')) return new Response('[]')
      return new Response(JSON.stringify({ counts: COUNTS }))
    })
    vi.stubGlobal('fetch', fetch)
    const navigate = vi.fn()
    render(Admin, { tab: 'questions', navigate })
    expect(await screen.findByRole('heading', { level: 2, name: 'Pending changes' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Refresh/ })).toBeNull()
    expect(fetch.mock.calls.some(([url]) => String(url).endsWith('/rooms'))).toBe(false)
    await fireEvent.click(screen.getByRole('link', { name: /Reports/ }))
    expect(navigate).toHaveBeenCalledWith('/admin/reports')
  })
})

