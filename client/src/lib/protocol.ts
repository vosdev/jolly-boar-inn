/**
 * TypeScript mirror of `server/app/ws/protocol.py`.
 *
 * Field names are the wire names, so they match the Python models character for
 * character — these types vanish at build time, and a name that drifts from the server
 * is a field that is silently `undefined` in the middle of a game rather than a
 * compile error. When `protocol.py` changes, change this file in the same commit.
 *
 * Two deliberate differences, both forced by the language:
 *
 * - `datetime` fields are ISO 8601 strings here. The server dumps with
 *   `model_dump(mode="json")`, so that is what actually arrives.
 * - `protocol.py`'s `Error` is `ProtocolError` here. `Error` is a global in TypeScript,
 *   and an `import type { Error }` would shadow it in the importing module.
 */

export type RoomStatus = 'lobby' | 'playing' | 'finished'
export type Phase = 'idle' | 'open' | 'reveal'
export type Role = 'player' | 'admin'

export type ErrorCode =
  | 'bad_hello'
  | 'bad_message'
  | 'not_admin'
  | 'not_open'
  | 'already_answered'
  | 'excluded'
  | 'bad_value'
  | 'bad_state'

/** `app/rooms/settings.py`. `max_players` is null only before the server resolves it. */
export interface RoomSettings {
  question_seconds: number
  question_count: number
  modes: string[]
  order: 'shuffle' | 'custom_last'
  reveal_seconds: number
  close_when_all_answered: boolean
  max_players: number | null
}

// --- Shared shapes ----------------------------------------------------------------

export interface RoomView {
  code: string
  status: RoomStatus
  settings: RoomSettings
  current_index: number | null
  total: number
  phase: Phase
  next_at: string | null
}

export interface PlayerView {
  id: string
  display_name: string
  role: Role
  connected: boolean
}

export interface Standing {
  player_id: string
  display_name: string
  points: number
  rank: number
}

export interface OpenQuestion {
  question_id: string
  index: number
  total: number
  type: string
  view: Record<string, unknown>
  opened_at: string
  ends_at: string
  you_can_answer: boolean
}

// --- Client → server --------------------------------------------------------------

export interface Hello {
  t: 'hello'
  session: string
}

export interface Ping {
  t: 'ping'
}

export interface Answer {
  t: 'answer'
  question_id: string
  value: unknown
}

export interface StartGame {
  t: 'start_game'
}

export interface Skip {
  t: 'skip'
}

export interface Promote {
  t: 'promote'
  player_id: string
}

export interface Kick {
  t: 'kick'
  player_id: string
}

export interface EndGame {
  t: 'end_game'
}

export type ClientMessage =
  | Hello
  | Ping
  | Answer
  | StartGame
  | Skip
  | Promote
  | Kick
  | EndGame

// --- Server → client --------------------------------------------------------------

export interface Welcome {
  t: 'welcome'
  room: RoomView
  you: PlayerView
  players: PlayerView[]
  question: OpenQuestion | null
  your_answer: unknown | null
  standings: Standing[]
  server_time: string
}

export interface RoomUpdated {
  t: 'room_updated'
  room: RoomView
  players: PlayerView[]
}

export interface QuestionOpen {
  t: 'question_open'
  question: OpenQuestion
}

export interface AnswerAck {
  t: 'answer_ack'
  question_id: string
  bucket: number
}

export interface PlayerResult {
  value: unknown
  correct: boolean
  points: number
}

export interface QuestionClosed {
  t: 'question_closed'
  question_id: string
  reveal: Record<string, unknown>
  results: Record<string, PlayerResult>
  standings: Standing[]
  next_at: string | null
}

export interface GameFinished {
  t: 'game_finished'
  standings: Standing[]
}

export interface Pong {
  t: 'pong'
  server_time: string
}

/** `protocol.py`'s `Error`. Renamed; the wire `t` is still `"error"`. */
export interface ProtocolError {
  t: 'error'
  code: ErrorCode
  message: string
}

export type ServerMessage =
  | Welcome
  | RoomUpdated
  | QuestionOpen
  | AnswerAck
  | QuestionClosed
  | GameFinished
  | Pong
  | ProtocolError
