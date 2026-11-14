/** The admin token: taken from the fragment once, kept out of the address bar and URLs. */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  ADMIN_TABS,
  adminPath,
  adminTabOf,
  forgetAdminToken,
  getCounts,
  getLive,
  hasAdminToken,
  keepAdminToken,
  pendingAdminToken,
  refreshLabel,
  refuseAdminToken,
  takeAdminToken,
  timeUntil,
} from './admin'
import { findSimilar, getSuggestionAllowance } from './api'

const TOKEN = '0123456789abcdef0123456789abcdef'

beforeEach(() => {
  localStorage.clear()
  history.replaceState(null, '', '/admin')
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('takeAdminToken', () => {
  it('takes the token from the fragment, out of the address bar, and stores it once kept', () => {
    history.replaceState(null, '', `/admin#token=${TOKEN}`)
    expect(takeAdminToken()).toBe(TOKEN)
    expect(localStorage.getItem('jbi:admin')).toBeNull()
    expect(pendingAdminToken()).toBe(TOKEN)
    keepAdminToken(TOKEN)
    expect(localStorage.getItem('jbi:admin')).toBe(TOKEN)
    expect(pendingAdminToken()).toBeNull()
    expect(location.href).not.toContain(TOKEN)
    expect(location.hash).toBe('')
    expect(location.pathname).toBe('/admin')
  })

  it('uses the stored token on a later visit', () => {
    localStorage.setItem('jbi:admin', TOKEN)
    expect(takeAdminToken()).toBe(TOKEN)
  })

  it('clears any other fragment and has no token without one', () => {
    history.replaceState(null, '', '/admin#nothing')
    expect(takeAdminToken()).toBeNull()
    expect(location.hash).toBe('')
  })

  it('falls back to the stored token when a link’s token is refused', () => {
    localStorage.setItem('jbi:admin', TOKEN)
    history.replaceState(null, '', '/admin#token=bad')
    expect(takeAdminToken()).toBe('bad')
    expect(refuseAdminToken('bad')).toBe(TOKEN)
    expect(localStorage.getItem('jbi:admin')).toBe(TOKEN)
    expect(pendingAdminToken()).toBeNull()
  })

  it('drops a refused stored token, with nothing to fall back to', () => {
    localStorage.setItem('jbi:admin', TOKEN)
    expect(takeAdminToken()).toBe(TOKEN)
    expect(refuseAdminToken(TOKEN)).toBeNull()
    expect(hasAdminToken()).toBe(false)
  })

  it('forgets the token', () => {
    localStorage.setItem('jbi:admin', TOKEN)
    expect(hasAdminToken()).toBe(true)
    forgetAdminToken()
    expect(hasAdminToken()).toBe(false)
    expect(takeAdminToken()).toBeNull()
  })
})

describe('the admin reads', () => {
  it('send the token as a bearer header and never in the URL', async () => {
    const fetch = vi.fn(
      async (url: string) =>
        new Response(
          JSON.stringify(url.endsWith('rooms') ? { rooms: [], sockets: 0 } : { counts: [] }),
        ),
    )
    vi.stubGlobal('fetch', fetch)
    await getLive(TOKEN)
    await getCounts(TOKEN)
    expect(fetch.mock.calls.map(([url]) => url)).toEqual(['/api/admin/rooms', '/api/admin/stats'])
    for (const [url, init] of fetch.mock.calls as unknown as [string, RequestInit][]) {
      expect(url).not.toContain(TOKEN)
      expect(init.headers).toEqual({ authorization: `Bearer ${TOKEN}` })
    }
  })

  it('fail with the status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 401 })),
    )
    await expect(getLive(TOKEN)).rejects.toMatchObject({ status: 401 })
  })
})

describe('timeUntil', () => {
  const now = Date.parse('2026-10-01T12:00:00Z')
  it.each([
    ['2026-10-01T11:00:00Z', 'now'],
    ['2026-10-01T12:41:30Z', '41 min'],
    ['2026-10-01T15:05:00Z', '3 h 5 min'],
    ['2026-10-04T11:00:00Z', '2 d 23 h'],
  ])('%s is %s away', (iso, label) => {
    expect(timeUntil(iso, now)).toBe(label)
  })
})

describe('refreshLabel', () => {
  const now = Date.parse('2026-10-01T12:00:00Z')
  it.each([
    [null, 'Refresh'],
    [now, 'Refresh · 0s ago'],
    [now - 7_900, 'Refresh · 7s ago'],
    [now + 500, 'Refresh · 0s ago'],
  ])('fetched at %s reads %s', (updatedAt, label) => {
    expect(refreshLabel(updatedAt, now)).toBe(label)
  })
})

describe('the tabs', () => {
  it('reads each tab from its path, the overview from /admin alone', () => {
    expect(adminTabOf('/admin')).toBe('overview')
    expect(adminTabOf('/admin/questions')).toBe('questions')
    expect(adminTabOf('/admin/roster')).toBe('roster')
    expect(adminTabOf('/admin/overview')).toBeNull()
    expect(adminTabOf('/admin/rooms')).toBeNull()
    expect(adminTabOf('/admin/questions/x')).toBeNull()
  })

  it('writes the path each tab is read from', () => {
    for (const tab of ADMIN_TABS) expect(adminTabOf(adminPath(tab))).toBe(tab)
  })
})

describe('suggestion calls', () => {
  it('carry the operator bearer only when this browser holds one', async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) => new Response('{"left":10,"retry_at":null}'),
    )
    vi.stubGlobal('fetch', fetchMock)
    await getSuggestionAllowance()
    expect(fetchMock.mock.calls[0]).toEqual(['/api/suggestions/allowance', { headers: {} }])
    localStorage.setItem('jbi:admin', TOKEN)
    await getSuggestionAllowance()
    await findSimilar({ type: 'free_text', payload: { prompt: 'p', accepted: ['a'] } } as never)
    for (const call of fetchMock.mock.calls.slice(1)) {
      expect(call[1]?.headers).toMatchObject({ authorization: `Bearer ${TOKEN}` })
    }
  })
})
