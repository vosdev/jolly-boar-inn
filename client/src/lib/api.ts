/**
 * Fetch wrappers for `/api`, one per endpoint in `app/http/`.
 *
 * The server renders every `ApiError` as `{code, message}` with a meaningful status
 * (`app/main.py`), so failures arrive as data. `request` turns them back into a thrown
 * `ApiFailure` carrying that code, which is what the screens branch on: `name_taken`
 * means try another name, `room_full` means the room is at capacity.
 *
 * Nothing here ever puts a secret in a URL. A display name goes in the JSON body of a
 * POST, and a session token is only ever *returned* by one -- from there it travels in
 * the first websocket frame and nowhere else.
 */

import type { EventFrequency, PlayerView, RoomSettings, RoomView } from './protocol'

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

/**
 * What a host may ask for. The server's `NewRoomSettings` checks the same ranges, and
 * fills in what is left out. A new room always has a frequency; only a stored one can be
 * without.
 */
export type NewRoomSettings = Omit<RoomSettings, 'max_players' | 'random_event_frequency'> & {
  random_event_frequency: EventFrequency
  max_players?: number | null
}

/** One number a mode's round is set with: what to offer, and what the server accepts. */
export interface ModeBounds {
  default: number
  min: number
  max: number
}

/**
 * How a round of one mode is paced, from the server's own mode registry.
 *
 * The create form draws its number fields from these rather than from constants of its
 * own: the defaults and the ranges are the server's policy (`app/modes`, falling back to
 * `questions/types/*.py`), and a second copy here would be a form that offers what the
 * server then refuses. The copy for a mode -- its name and its blurb -- is the client's,
 * and lives in `lib/modes.ts`.
 */
export interface ModePacing {
  id: string
  /**
   * The question types a round of the mode is answered in. Empty for `custom` and
   * `random_event`, whose questions each carry their own.
   */
  types: string[]
  /**
   * How many questions its round holds, and how long each stays open. Both null for
   * `custom` and `random_event`, which are never rounds: their questions are random
   * events, paced by their own types, so the form does not offer them as rounds.
   */
  questions: ModeBounds | null
  seconds: ModeBounds | null
}

/** Registry order, which is the order the create form lists them in. */
export function getModes(): Promise<ModePacing[]> {
  return request<ModePacing[]>('/api/modes')
}

export interface VocabEntry {
  id: number
  name: string
}

/** `GET /api/vocab/{name}`: a closed answer list. `lib/vocab.ts` caches and searches it. */
export interface Vocab {
  vocab: string
  /** A hash of the entries; two builds with different lists have different versions. */
  version: string
  entries: VocabEntry[]
}

/** `not_found` for a list this build does not have (`npcs` until the importer runs). */
export function getVocab(name: string): Promise<Vocab> {
  return request<Vocab>(`/api/vocab/${encodeURIComponent(name)}`)
}

export interface Credentials {
  session: string
  player: PlayerView
}

/** The creator is the room's admin, so creating one signs you in as its host. */
export interface CreatedRoom extends Credentials {
  code: string
  /** ISO time the room is deleted, unless starting its game gives it a new lifetime. */
  expires_at: string
}

/** What a lookup tells somebody who has not joined: whether they can, and how many are in. */
export interface RoomSnapshot {
  status: RoomView['status']
  players: number
}

/** `avatar` is the profile's head (D4); left out, the room draws the one derived from the id. */
export function createRoom(
  displayName: string,
  settings: NewRoomSettings,
  avatar?: number,
): Promise<CreatedRoom> {
  return request<CreatedRoom>('/api/rooms', {
    method: 'POST',
    body: JSON.stringify({ display_name: displayName, avatar, settings, custom_questions: [] }),
  })
}

export function joinRoom(code: string, displayName: string, avatar?: number): Promise<Credentials> {
  return request<Credentials>(`/api/rooms/${encodeURIComponent(code)}/join`, {
    method: 'POST',
    body: JSON.stringify({ display_name: displayName, avatar }),
  })
}

export function getRoom(code: string): Promise<RoomSnapshot> {
  return request<RoomSnapshot>(`/api/rooms/${encodeURIComponent(code)}`)
}

/**
 * Remove a room, which the server does there and then: the row goes, players and
 * answers with it, and anybody still connected is closed out.
 *
 * Only an admin of the room may, so the stored session travels in the body -- the one
 * request that sends a token rather than receiving one, and still not in the URL. The
 * server answers `204` with no body; a caller who is not the host gets `not_admin`, and
 * a room that is already gone `not_found` or `expired`.
 */
export function deleteRoom(code: string, session: string): Promise<void> {
  return request<void>(`/api/rooms/${encodeURIComponent(code)}`, {
    method: 'DELETE',
    body: JSON.stringify({ session }),
  })
}
