/**
 * Fetch wrappers for `/api`, one per endpoint in `app/http/`.
 *
 * The server renders every `ApiError` as `{code, message}` with a meaningful status
 * (`app/main.py`), so failures arrive as data. `request` turns them back into a thrown
 * `ApiFailure` carrying that code, which is what the screens branch on: `token_used`
 * means the claim link is spent, `name_taken` means try another name.
 *
 * Nothing here ever puts a secret in a URL. The admin token and the display name go in
 * the JSON body of a POST; the session token never touches HTTP at all, only the first
 * websocket frame.
 */

import type { PlayerView, RoomSettings, RoomView } from './protocol'

export class ApiFailure extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'ApiFailure'
    this.status = status
    this.code = code
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, {
      ...init,
      headers: init?.body === undefined ? undefined : { 'content-type': 'application/json' },
    })
  } catch {
    throw new ApiFailure(0, 'unreachable', 'cannot reach the server')
  }
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const fault = (body ?? {}) as { code?: unknown; message?: unknown }
    const code = typeof fault.code === 'string' ? fault.code : 'error'
    const message =
      typeof fault.message === 'string' ? fault.message : `request failed (${response.status})`
    throw new ApiFailure(response.status, code, message)
  }
  return body as T
}

/** What a host may ask for. The server's `NewRoomSettings` checks the same ranges. */
export type NewRoomSettings = Omit<RoomSettings, 'max_players'> & { max_players?: number | null }

export interface CreatedRoom {
  code: string
  /** Absolute, and carrying the admin token in its fragment. Single use. */
  admin_url: string
}

export interface Credentials {
  session: string
  player: PlayerView
}

export interface RoomSnapshot {
  room: RoomView
  players: PlayerView[]
}

export function createRoom(settings: NewRoomSettings): Promise<CreatedRoom> {
  return request<CreatedRoom>('/api/rooms', {
    method: 'POST',
    body: JSON.stringify({ settings, custom_questions: [] }),
  })
}

/** The token goes in the body. Putting it in the path would log it. */
export function claimAdmin(
  code: string,
  token: string,
  displayName: string,
): Promise<Credentials> {
  return request<Credentials>(`/api/rooms/${encodeURIComponent(code)}/claim`, {
    method: 'POST',
    body: JSON.stringify({ token, display_name: displayName }),
  })
}

export function joinRoom(code: string, displayName: string): Promise<Credentials> {
  return request<Credentials>(`/api/rooms/${encodeURIComponent(code)}/join`, {
    method: 'POST',
    body: JSON.stringify({ display_name: displayName }),
  })
}

/** `RoomView` plus players, never questions. */
export function getRoom(code: string): Promise<RoomSnapshot> {
  return request<RoomSnapshot>(`/api/rooms/${encodeURIComponent(code)}`)
}
