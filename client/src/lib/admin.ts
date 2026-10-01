/**
 * The operator's admin view: its token, and the two reads behind it.
 *
 * The token arrives once, in the fragment of `/admin#token=…`. A fragment never reaches
 * the server, so it stays out of the access log and out of any `Referer`. It is moved into
 * localStorage and out of the address bar on that first load, and from then on travels
 * only as `Authorization: Bearer`. Nothing in the app links here.
 */

import { ApiFailure } from './api'
import { dropStored, readStored, writeStored } from './session'

const TOKEN_KEY = 'jbi:admin'

export interface LiveRound {
  index: number
  total: number
  mode: string
}

export interface LiveRoom {
  code: string
  status: 'lobby' | 'playing' | 'finished'
  round: LiveRound | null
  connected: number
  players: number
  waiting: boolean
  created_at: string
  deletes_at: string
}

export interface Live {
  rooms: LiveRoom[]
  sockets: number
}

/** One day's count of one metric, keyed by mode where that matters. */
export interface Count {
  day: string
  metric: string
  key: string
  count: number
}

/**
 * The token in the address bar, moved into storage, or else the stored one.
 *
 * Any fragment is cleared from the address bar, so a token never sits there to be
 * shared in a screenshot or kept in the history.
 */
export function takeAdminToken(): string | null {
  const fromLink = new URLSearchParams(location.hash.slice(1)).get('token')
  if (location.hash !== '') history.replaceState(history.state, '', location.pathname)
  if (fromLink !== null && fromLink !== '') {
    writeStored(TOKEN_KEY, fromLink)
    return fromLink
  }
  return readStored(TOKEN_KEY)
}

export function forgetAdminToken(): void {
  dropStored(TOKEN_KEY)
}

async function adminGet<T>(path: string, token: string): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, { headers: { authorization: `Bearer ${token}` } })
  } catch {
    throw new ApiFailure(0, 'unreachable', 'cannot reach the server')
  }
  if (!response.ok) {
    throw new ApiFailure(response.status, 'error', `request failed (${response.status})`)
  }
  return (await response.json()) as T
}

export function getLive(token: string): Promise<Live> {
  return adminGet('/api/admin/rooms', token)
}

export async function getCounts(token: string): Promise<Count[]> {
  return (await adminGet<{ counts: Count[] }>('/api/admin/stats', token)).counts
}

/** How long until `iso`, coarsely: "41 min", "2 d 23 h", "now". */
export function timeUntil(iso: string, now: number): string {
  const minutes = Math.floor((Date.parse(iso) - now) / 60_000)
  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} h ${minutes % 60} min`
  return `${Math.floor(hours / 24)} d ${hours % 24} h`
}
