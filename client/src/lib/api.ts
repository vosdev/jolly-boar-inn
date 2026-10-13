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

import type { CustomQuestion } from './customQuestions'
import type {
  EventFrequency,
  ModeSettings,
  Pace,
  PlayerView,
  RoomSettings,
  RoomView,
} from './protocol'
import type { ReportBody, ReportChoices } from './reports'
import type { Arrival } from './stats'
import type { SuggestionBody } from './suggestions'

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
export type NewRoomSettings = Omit<
  RoomSettings,
  'max_players' | 'random_event_frequency' | 'modes'
> & {
  /** Left out when `surprise_modes` asks the server to draw the rounds. */
  modes?: ModeSettings[]
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
 * How many questions a round of one mode holds, from the server's own mode registry.
 *
 * The create form draws its number field from these rather than from constants of its
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
   * How many questions its round holds. Null for `custom` and `random_event`, which are
   * never rounds: their questions are random events, so the form does not offer them.
   */
  questions: ModeBounds | null
  /** What one of its pack questions typically takes, open and revealed, per pace; null with none. */
  seconds: Record<Pace, number> | null
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

/** A player named on `/credits`, with how many pack questions carry their name. */
export interface Author {
  name: string
  questions: number
}

/** `GET /api/credits`: only the authors who agreed to be named, most questions first. */
export function getCredits(): Promise<{ authors: Author[] }> {
  return request<{ authors: Author[] }>('/api/credits')
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

/**
 * Who can join a new room: anyone with its code, only those with its invite link, or
 * anyone at all, from the list on Home. The server takes the last two as flags it
 * refuses together.
 */
export type RoomAccess = 'code' | 'link' | 'public'

/**
 * `avatar` is the profile's pet; undefined, the room picks one.
 * `returning` is `returningVisitor`, counted by the server and never stored.
 * `customQuestions` are the host's own, each a random event (`lib/customQuestions.ts`).
 * `arrival` is for the counters (`lib/stats.ts`), and never has a `via`: nobody arrives at
 * a room they made. `code` is the one `getFreeCode` handed out; undefined, the server draws one.
 */
export function createRoom(
  displayName: string,
  settings: NewRoomSettings,
  avatar: string | undefined,
  returning: boolean,
  access: RoomAccess = 'code',
  customQuestions: readonly CustomQuestion[] = [],
  arrival: Omit<Arrival, 'via'> = {},
  code?: string,
): Promise<CreatedRoom> {
  return request<CreatedRoom>('/api/rooms', {
    method: 'POST',
    body: JSON.stringify({
      display_name: displayName,
      code,
      avatar,
      returning,
      invite_only: access === 'link',
      public: access === 'public',
      settings,
      custom_questions: customQuestions,
      ...arrival,
    }),
  })
}

/** As `createRoom`, for a room that already exists. `key` is the invite link's, if it had one. */
export function joinRoom(
  code: string,
  displayName: string,
  avatar: string | undefined,
  returning: boolean,
  key: string | null = null,
  arrival: Arrival = {},
): Promise<Credentials> {
  return request<Credentials>(`/api/rooms/${encodeURIComponent(code)}/join`, {
    method: 'POST',
    body: JSON.stringify({ display_name: displayName, avatar, returning, key, ...arrival }),
  })
}

/**
 * Ask an invite-only room's host to let you in without its key. The ticket answers to
 * `pollRequest` and `cancelRequest`, in their bodies only, like a session. `arrival` is
 * counted only if the host lets you in.
 */
export function askToJoin(
  code: string,
  displayName: string,
  avatar: string | undefined,
  returning: boolean,
  arrival: Arrival = {},
): Promise<{ ticket: string }> {
  return request<{ ticket: string }>(`/api/rooms/${encodeURIComponent(code)}/requests`, {
    method: 'POST',
    body: JSON.stringify({ display_name: displayName, avatar, returning, ...arrival }),
  })
}

/** Still waiting, or let in with what a join returns. Turned away is `request_denied`. */
export type RequestStatus = { status: 'waiting' } | ({ status: 'accepted' } & Credentials)

export function pollRequest(code: string, ticket: string): Promise<RequestStatus> {
  return request<RequestStatus>(`/api/rooms/${encodeURIComponent(code)}/requests/poll`, {
    method: 'POST',
    body: JSON.stringify({ ticket }),
  })
}

/** Withdraw a request. `keepalive`, so it still goes when the page is on its way out. */
export function cancelRequest(code: string, ticket: string): Promise<void> {
  return request<void>(`/api/rooms/${encodeURIComponent(code)}/requests/cancel`, {
    method: 'POST',
    body: JSON.stringify({ ticket }),
    keepalive: true,
  })
}

/** A lobby on Home's list: what joining it would show anyway, and no more. */
export interface PublicRoom {
  code: string
  host: { id: string; display_name: string; avatar: string | null }
  players: number
  max_players: number
  rounds: number
  /** Left out when the room keeps its rounds a surprise. */
  modes?: string[]
}

/** A room code nobody holds right now. Not reserved: a create may still find it taken. */
export async function getFreeCode(): Promise<string> {
  return (await request<{ code: string }>('/api/rooms/free-code')).code
}

/** Newest first. Empty when the server has the list turned off. */
export function getPublicRooms(): Promise<PublicRoom[]> {
  return request<PublicRoom[]>('/api/rooms/public')
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

/** How many more suggestions this address may send this hour, and when one frees up if none. */
export interface Allowance {
  left: number
  retry_at: string | null
}

export function getSuggestionAllowance(): Promise<Allowance> {
  return request<Allowance>('/api/suggestions/allowance')
}

/** `bad_suggestion` or `bad_name` for what the server refuses; `rate_limited` past the limit. */
export function sendSuggestion(body: SuggestionBody): Promise<{ id: string }> {
  return request<{ id: string }>('/api/suggestions', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function getReportAllowance(): Promise<Allowance> {
  return request<Allowance>('/api/reports/allowance')
}

/** The modes a player may report a question from, in registry order. */
export function getReportModes(): Promise<string[]> {
  return request<string[]>('/api/questions/modes')
}

/** What the report form searches for `mode`: never an answer. */
export function getReportChoices(mode: string): Promise<ReportChoices> {
  return request<ReportChoices>(`/api/questions?mode=${encodeURIComponent(mode)}`)
}

/** `bad_report` for what the server refuses; `rate_limited` past the limit. */
export function sendReport(body: ReportBody): Promise<{ id: string }> {
  return request<{ id: string }>('/api/reports', { method: 'POST', body: JSON.stringify(body) })
}
