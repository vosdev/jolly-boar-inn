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
export type Phase = 'idle' | 'splash' | 'open' | 'reveal'
export type Role = 'player' | 'admin'
/** How a question's credit becomes points: `questions/types/scoring.py`'s `Scoring`. */
export type Scoring = 'speed' | 'rank' | 'step'

export type ErrorCode =
  | 'bad_hello'
  | 'bad_message'
  | 'not_admin'
  | 'not_open'
  | 'already_answered'
  | 'excluded'
  | 'bad_value'
  | 'bad_state'
  // `set_profile` (D4), validated like a join and refused with the codes join uses.
  | 'bad_name'
  | 'name_taken'
  | 'bad_avatar'

/** One mode's round: how many questions it holds, and how long each one is open. */
export interface ModeSettings {
  /** A mode id, never a question type; the key into `lib/modes.ts`. */
  mode: string
  questions: number
  seconds: number
}

/** `app/rooms/settings.py`. `max_players` is null only before the server resolves it. */
export interface RoomSettings {
  /** A mode is a round: this list *is* the rounds, one each, in the order they play. */
  modes: ModeSettings[]
  /** `listed`: the order the host arranged. `random`: shuffled once, at creation. */
  mode_order: 'listed' | 'random'
  /** Where the room's own questions go; nothing to do with `mode_order`. Phase 2. */
  order: 'shuffle' | 'custom_last'
  reveal_seconds: number
  /**
   * Zero means no splash at all; anything else, a splash that waits for the room to be
   * ready (D7). No longer a length, but still a number so every stored room reads.
   */
  splash_seconds: number
  close_when_all_answered: boolean
  max_players: number | null
}

// --- Shared shapes ----------------------------------------------------------------

/**
 * The round the room is in: one mode, a run of consecutive questions.
 *
 * `start` is a position in the room's question list, which is what `OpenQuestion.index`
 * counts in too, so the question number within the round is `index - start + 1`.
 */
export interface Segment {
  /** A mode id, never a question type; the key into `lib/modes.ts`. */
  mode: string
  /** 0-based round number. */
  index: number
  /** Rounds in this room. */
  total: number
  /** Position of the round's first question. */
  start: number
  /** Questions in the round. */
  count: number
}

export interface RoomView {
  code: string
  status: RoomStatus
  settings: RoomSettings
  current_index: number | null
  total: number
  phase: Phase
  /** When the current timed phase ends: a splash's first question, or the next question. */
  next_at: string | null
  /** The round in progress; null before the first question and once the game is over. */
  segment: Segment | null
}

export interface PlayerView {
  id: string
  display_name: string
  /**
   * A head id in `data/heads/heads.json`, or null for a player who never chose one.
   * Optional because a server from before D4 does not send it; `lib/heads.ts` draws the
   * head derived from `id` for both.
   */
  avatar?: number | null
  role: Role
  connected: boolean
  /**
   * The ready check (D7): ready to start in the lobby, ready for this round on a splash.
   * Every splash starts it false for everyone again. Optional because a server from
   * before D7 does not send it, and a player it does not mention is not ready.
   */
  ready?: boolean
}

export interface Standing {
  player_id: string
  display_name: string
  /** As on `PlayerView`. */
  avatar?: number | null
  points: number
  rank: number
}

export interface OpenQuestion {
  question_id: string
  index: number
  total: number
  /** How it is answered: the key into `components/questions/index.ts`. */
  type: string
  /** Which mode it was drawn for; not the same string as `type` since T16. */
  mode: string
  /**
   * Repeated from `RoomView` because `stores.ts` patches its room from this frame rather
   * than replacing it, and a round can change with no splash to announce it
   * (`splash_seconds` at zero, or two consecutive rounds of the same mode).
   */
  segment: Segment
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

/** Rename, re-roll the head, or both. An omitted field is left alone (D4). */
export interface SetProfile {
  t: 'set_profile'
  display_name?: string
  avatar?: number
}

/** Tap ready, or take it back (D7). In the lobby and on a splash; nowhere else. */
export interface Ready {
  t: 'ready'
  ready: boolean
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
  | SetProfile
  | Ready

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

/**
 * How the answer will be scored and where it landed, never whether it was right.
 * `band` is the speed bucket (1–5) for `speed`, the step it arrived on for `step`, and
 * null for `rank`, where nothing is known until everyone has answered.
 */
export interface AnswerAck {
  t: 'answer_ack'
  question_id: string
  scoring: Scoring
  band: number | null
}

export interface PlayerResult {
  value: unknown
  /** Full credit. The standings tie-break counts these. */
  correct: boolean
  /** What the type graded the answer, 0 to 1; between the two only for partial credit. */
  credit: number
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
