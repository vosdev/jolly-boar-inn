/**
 * What this browser tells the server's daily counters (`app/stats.py`): how it got to a
 * room, its theme and its kind of device, and the join failures it showed its player.
 * Never who: nothing here carries a name, a code or anything typed.
 *
 * The theme and the device are counted once per browser rather than once per join, so a
 * regular is not a crowd. The browser remembers what it last reported and sends each
 * again only when it changes, and only once a join or create that counted it went
 * through. Only a theme the player picked is sent; one never picked is the default, and
 * says nothing. The route is per join.
 *
 * Storage may throw, like everywhere else here. A browser that cannot remember reports
 * again on its next join, which overcounts it, and that is better than not playing.
 */

import { ApiFailure } from './api'
import { storedTheme, type Theme } from './theme'

export type Device = 'mobile' | 'desktop'

/** Home's public list, an invite link with its key, a code typed on Home, a plain link. */
export type Route = 'public' | 'invite' | 'code' | 'link'

/** The optional fields a create or join body adds for the counters. */
export interface Arrival {
  theme?: Theme
  device?: Device
  via?: Route
}

export type JoinFailure =
  | 'not_found'
  | 'name_taken'
  | 'room_full'
  | 'not_joinable'
  | 'bad_key'
  | 'requests_full'
  | 'request_denied'

const REPORTED_THEME = 'jbi:theme-counted'
const REPORTED_DEVICE = 'jbi:device-counted'

/** The server's error code for each failure worth counting. `key_required` is the way in to
 *  a join request, not a failure, and anything unlisted is the network or a bug. */
const FAILURES: Record<string, JoinFailure> = {
  not_found: 'not_found',
  name_taken: 'name_taken',
  room_full: 'room_full',
  not_open: 'not_joinable',
  bad_key: 'bad_key',
  requests_full: 'requests_full',
  request_denied: 'request_denied',
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Storage denied: reported again next time.
  }
}

/** A tablet is a phone here: both are held, and tapped rather than clicked. */
export function device(): Device {
  return matchMedia('(pointer: coarse)').matches ? 'mobile' : 'desktop'
}

/** What to send on the way into a room: whatever has changed since last counted, and `via`. */
export function arrival(via?: Route): Arrival {
  const sent: Arrival = {}
  const theme = storedTheme()
  if (theme !== null && theme !== read(REPORTED_THEME)) sent.theme = theme
  const kind = device()
  if (kind !== read(REPORTED_DEVICE)) sent.device = kind
  if (via !== undefined) sent.via = via
  return sent
}

/** The server counted `sent`; do not send it again. */
export function counted(sent: Arrival): void {
  if (sent.theme !== undefined) write(REPORTED_THEME, sent.theme)
  if (sent.device !== undefined) write(REPORTED_DEVICE, sent.device)
}

/** How a player reached `/r/:code`: a key is an invite, else what Home said, else a link. */
export function routeOf(key: string | null, state: unknown): Route {
  if (key !== null) return 'invite'
  const via = (state as { via?: unknown } | null)?.via
  return via === 'public' || via === 'code' ? via : 'link'
}

/** The failure a join error counts as, if it counts at all. */
export function failureOf(error: unknown): JoinFailure | null {
  return error instanceof ApiFailure ? (FAILURES[error.code] ?? null) : null
}

/** Count a failure the player was shown. Fire and forget: a lost report costs nothing. */
export function reportFailure(reason: JoinFailure | null): void {
  if (reason === null) return
  void fetch('/api/stats/join-failure', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ reason }),
  }).catch(() => undefined)
}
