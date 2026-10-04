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
/**
 * `standings` sits between a round's last reveal and the next round, and nowhere
 * else. A screen that does not know a phase shows its waiting state, which is what a
 * build from before one arrived does with it.
 */
export type Phase = 'idle' | 'splash' | 'open' | 'reveal' | 'standings'
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
  // `set_profile`, validated like a join and refused with the codes join uses.
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
/** How often an NPC interrupts: there is no off switch, `less` is the fewest. */
export type EventFrequency = 'less' | 'default' | 'more'

/** Round questions per random event at each frequency: `rooms/settings.py`'s `EVENT_EVERY`. */
export const EVENT_EVERY: Record<EventFrequency, number> = { less: 20, default: 10, more: 5 }

export interface RoomSettings {
  /** A mode is a round: this list *is* the rounds, one each, in the order they play. */
  modes: ModeSettings[]
  /** `listed`: the order the host arranged. `random`: shuffled once, at creation. */
  mode_order: 'listed' | 'random'
  /**
   * One random event per 20, 10 or 5 round questions (`EVENT_EVERY`), added on top of the
   * rounds. Null only for a room stored before frequency was a choice, with its host's
   * questions and nothing else, which the server still loads but never creates.
   */
  random_event_frequency: EventFrequency | null
  reveal_seconds: number
  /**
   * Zero means no splash at all; anything else, a splash that waits for the room to be
   * ready. No longer a length, but still a number so every stored room reads.
   */
  splash_seconds: number
  /** How long the standings hold between two rounds. Zero turns them off. */
  standings_seconds: number
  close_when_all_answered: boolean
  /**
   * Name who answered wrong under a reveal. Optional: a server from before it does
   * not send it, and that reads as off.
   */
  name_wrong_answers?: boolean
  /**
   * Surprise rounds: a player is sent only the `modes` that have started, an admin all of
   * them. Absent means off.
   */
  hide_rounds?: boolean
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
  /**
   * When the current timed phase ends: a splash's first question, a reveal's next question
   * or standings, the standings' next round.
   */
  next_at: string | null
  /** The round in progress; null before the first question and once the game is over. */
  segment: Segment | null
  /** When the game ended, by the server's clock; null until it has. */
  finished_at: string | null
  /** How many rounds the room plays; sent only with `settings.hide_rounds`. */
  rounds?: number
  /** An invite-only room's key; sent to its admins only. */
  key?: string
  /** Who is asking to be let in without the key, oldest first; an invite-only room's admins only. */
  requests?: JoinRequestView[]
}

export interface JoinRequestView {
  id: string
  display_name: string
  avatar: number | null
}

export interface PlayerView {
  id: string
  display_name: string
  /**
   * A head id in `data/heads/heads.json`, or null for a player who never chose one.
   * Optional because a server from before heads does not send it; `lib/heads.ts` draws the
   * head derived from `id` for both.
   */
  avatar?: number | null
  role: Role
  connected: boolean
  /**
   * The ready check: ready to start in the lobby, ready for this round on a splash.
   * Every splash starts it false for everyone again. Optional because a server from
   * before the ready check does not send it, and a player it does not mention is not ready.
   */
  ready?: boolean
  /** Is typing a name in the lobby: "picking a name…". Advice, never a gate. */
  editing?: boolean
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
  /** Which mode it was drawn for; no longer the same string as `type`. */
  mode: string
  /**
   * Repeated from `RoomView` because `stores.ts` patches its room from this frame rather
   * than replacing it, and a round can change with no splash to announce it
   * (`splash_seconds` at zero, or two consecutive rounds of the same mode).
   */
  segment: Segment
  view: Record<string, unknown>
  /**
   * The NPC interrupting the round with this question, looked up in `lib/randomEvents.ts`;
   * null for a question that belongs to its round. Optional because a server from before
   * random events does not send it, and that reads as nobody interrupting.
   */
  random_event?: string | null
  opened_at: string
  /**
   * When the buttons appear and the clock starts: `opened_at` for an ordinary question,
   * later for an event, whose NPC holds the floor first. An answer before it is
   * `not_open`, and `ends_at` is this plus the question's own seconds. Optional for the
   * same reason as `random_event`; missing, it is `opened_at`.
   */
  answerable_at?: string
  ends_at: string
  you_can_answer: boolean
  /**
   * How many have answered, of how many can (for the waiting state), as of this frame: zero
   * on `question_open`, the live count in a `welcome`. `answer_count` and our own
   * `answer_ack` keep it current after that. Optional because a server from before the count
   * does not send it, and the waiting state then goes without the count.
   */
  answered?: number
  of?: number
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

/**
 * End `phase` of the question at `index`: what the host was looking at when they pressed
 * it, so a second tap that lands once the room has moved on ends nothing.
 */
export interface Skip {
  t: 'skip'
  phase: Exclude<Phase, 'idle'>
  index: number
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

/** Replace an invite-only room's key, so the old link stops working. Lobby only. */
export interface RotateKey {
  t: 'rotate_key'
}

/** Let a join request in, or turn it away. */
export interface DecideRequest {
  t: 'decide_request'
  request_id: string
  accept: boolean
}

/** Rename, re-roll the head, or both. An omitted field is left alone. */
export interface SetProfile {
  t: 'set_profile'
  display_name?: string
  avatar?: number
}

/** Tap ready, or take it back. In the lobby and on a splash; nowhere else. */
export interface Ready {
  t: 'ready'
  ready: boolean
}

/** The name field gained focus in the lobby, or lost it. Re-sent while focused, or it lapses. */
export interface Editing {
  t: 'editing'
  on: boolean
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
  | RotateKey
  | DecideRequest
  | SetProfile
  | Ready
  | Editing

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
  /** `/VERSION` of the running server; a bundle from another version reloads itself. */
  server_version: string
}

export interface RoomUpdated {
  t: 'room_updated'
  room: RoomView
  players: PlayerView[]
}

/** A ready tap, connect or disconnect that changed the players and nothing else. */
export interface PlayersUpdated {
  t: 'players_updated'
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
  /** The room's count with our answer in it. Optional: a server from before the count. */
  answered?: number
  of?: number
}

/** Somebody else answered the open question. A count, never who or what. */
export interface AnswerCount {
  t: 'answer_count'
  question_id: string
  answered: number
  of: number
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
  /** The player who suggested the question, when they asked to be named; left out otherwise. */
  suggested_by?: string
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
  | PlayersUpdated
  | QuestionOpen
  | AnswerAck
  | AnswerCount
  | QuestionClosed
  | GameFinished
  | Pong
  | ProtocolError
