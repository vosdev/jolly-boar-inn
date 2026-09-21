/**
 * The room as this client knows it, rebuilt from server frames.
 *
 * `welcome` is a full snapshot and is applied as a replacement, never a merge
 * (section 3, reconnect step 2). That is the whole reason the reconnect flow is as
 * simple as it is: a client that has been asleep for two questions does not have to
 * work out what it missed, it throws away what it had.
 *
 * Plain `svelte/store` writables rather than runes, because runes only compile inside
 * `.svelte` / `.svelte.ts` files and section 1 names this module `stores.ts`.
 */

import { get, writable } from 'svelte/store'

import type {
  ClientMessage,
  OpenQuestion,
  PlayerView,
  ProtocolError,
  QuestionClosed,
  RoomView,
  ServerMessage,
  Standing,
} from './protocol'
import type { ConnectionState } from './ws'

export const room = writable<RoomView | null>(null)
export const you = writable<PlayerView | null>(null)
export const players = writable<PlayerView[]>([])
export const question = writable<OpenQuestion | null>(null)
export const yourAnswer = writable<unknown>(null)
export const standings = writable<Standing[]>([])
/**
 * The `question_closed` frame for the question being revealed right now, plus the
 * question it closed.
 *
 * The frame is the only carrier of the correct answer and the per-player results, and
 * it never arrives twice, so it is kept until the next question opens. A client that
 * connects during a reveal never gets one — `welcome` has no reveal in it — which is
 * why the reveal screen has to work from the standings alone as well.
 *
 * `was` is the question as it stood while it was open, kept because the frame carries
 * neither the type that shaped `reveal` nor whether this player was allowed to score on
 * it. Null only if this client never saw the question open, in which case there is
 * nothing on screen to reveal either.
 */
export interface ClosedQuestion extends QuestionClosed {
  was: OpenQuestion | null
}

export const lastClosed = writable<ClosedQuestion | null>(null)
/** The speed bucket (1–5) the server acked our answer with. Null until it does. */
export const answerBucket = writable<number | null>(null)
export const connection = writable<ConnectionState>('connecting')
/** The last rejected message. Screens show it and clear it; nothing else depends on it. */
export const lastError = writable<ProtocolError | null>(null)
/**
 * The last rejected `set_profile` (D4). Kept apart from `lastError` because the answer
 * belongs in the popover that sent it — "that name is taken" under the name field — not
 * in a banner across the lobby.
 */
export const profileError = writable<ProtocolError | null>(null)
const PROFILE_ERRORS: ReadonlySet<string> = new Set(['bad_name', 'name_taken', 'bad_avatar'])

/**
 * Send on the room's socket, from outside the Room screen: the top bar's identity chip
 * renames and re-rolls with `set_profile` (D4). Room sets this while its socket is open
 * and clears it on the way out; null means there is no room to send to.
 */
export const roomSend = writable<((message: ClientMessage) => boolean) | null>(null)

/**
 * `server_time` minus this browser's clock, in ms, as of the last frame that carried one.
 *
 * Timers are computed from `ends_at` against server time, not against the local clock
 * (section 3, reconnect step 2) — a phone whose clock is a minute out would otherwise
 * show a minute of nonsense.
 */
export const serverOffsetMs = writable(0)

function noteServerTime(serverTime: string): void {
  const server = Date.parse(serverTime)
  if (!Number.isNaN(server)) serverOffsetMs.set(server - Date.now())
}

/**
 * Fields the server changes on its own `Room` when it sends a frame that is not
 * `room_updated`.
 *
 * The server broadcasts `room_updated` for membership and status changes, and for the
 * start of a splash; `question_open` and `question_closed` move the room between `open`
 * and `reveal` without one. Applying that here is what lets the screen switch on `room.phase`
 * instead of second-guessing it: the client's `RoomView` stays the same view of the
 * room the server has, and a `welcome` replaces it outright if it ever drifts.
 */
function patchRoom(patch: Partial<RoomView>): void {
  room.update((current) => (current === null ? null : { ...current, ...patch }))
}

/** Forget one question: our answer, its ack, and the reveal it ended in. */
function forgetQuestion(): void {
  yourAnswer.set(null)
  answerBucket.set(null)
  lastClosed.set(null)
}

/**
 * We have sent an `answer` and not heard back yet.
 *
 * Optimistic on purpose: the buttons go dead on the click rather than a round trip
 * later, which is what stops a double tap from becoming an `already_answered` error.
 * `answer_ack` confirms it with a bucket; a rejection puts the buttons back.
 */
export function noteAnswerSent(value: unknown): void {
  yourAnswer.set(value)
  answerBucket.set(null)
}

/**
 * Error codes that mean the answer we just sent was not taken, so the optimistic value
 * above has to go. `already_answered` is not one of them: the server is telling us it
 * has an answer from us, which is the state we are already showing.
 */
const ANSWER_REJECTED: ReadonlySet<string> = new Set(['not_open', 'excluded', 'bad_value'])

/** Drop everything. Called when leaving a room, so the next one starts clean. */
export function resetRoom(): void {
  room.set(null)
  you.set(null)
  players.set([])
  question.set(null)
  standings.set([])
  forgetQuestion()
  lastError.set(null)
  profileError.set(null)
  connection.set('connecting')
  serverOffsetMs.set(0)
}

export function applyServerMessage(message: ServerMessage): void {
  switch (message.t) {
    case 'welcome':
      // Replace, do not merge.
      room.set(message.room)
      you.set(message.you)
      players.set(message.players)
      question.set(message.question)
      standings.set(message.standings)
      // No reveal and no bucket in a snapshot: a client that arrives mid-reveal shows
      // the scoreboard, not the answer it never saw revealed.
      forgetQuestion()
      yourAnswer.set(message.your_answer)
      lastError.set(null)
      noteServerTime(message.server_time)
      break

    case 'room_updated':
      room.set(message.room)
      players.set(message.players)
      // `room_updated` has no `you` field, but the player list has us in it. A promote
      // changes our own role and this frame is the only thing that carries it, so
      // without this the promoted client keeps a stale `player` role and never sees
      // the controls it just earned. Falling back to the current value keeps a kicked
      // player's identity readable while their socket closes.
      you.update((current) =>
        current === null
          ? null
          : (message.players.find((player) => player.id === current.id) ?? current),
      )
      break

    case 'question_open':
      question.set(message.question)
      forgetQuestion()
      // The segment comes along because a round can change with no splash to announce
      // it — `splash_seconds` at zero, or a new round of the mode already playing — and
      // this frame is then the only thing carrying the change.
      patchRoom({
        phase: 'open',
        current_index: message.question.index,
        segment: message.question.segment,
        next_at: null,
      })
      break

    case 'question_closed':
      // The question is behind us. A client that reconnects during a reveal is sent
      // `question: null` too, so this leaves both paths in the same state; the reveal
      // this frame carries is what the two screens differ by.
      {
        const open = get(question)
        question.set(null)
        standings.set(message.standings)
        lastClosed.set({
          ...message,
          was: open?.question_id === message.question_id ? open : null,
        })
      }
      patchRoom({ phase: 'reveal', next_at: message.next_at })
      break

    case 'game_finished':
      question.set(null)
      standings.set(message.standings)
      // The `room_updated` that precedes this frame already says `finished`; saying it
      // again costs nothing and means the final screen never waits on frame order.
      patchRoom({ status: 'finished', phase: 'idle', next_at: null })
      break

    case 'answer_ack':
      answerBucket.set(message.bucket)
      break

    case 'pong':
      noteServerTime(message.server_time)
      break

    case 'error':
      if (PROFILE_ERRORS.has(message.code)) {
        profileError.set(message)
        break
      }
      lastError.set(message)
      if (ANSWER_REJECTED.has(message.code)) yourAnswer.set(null)
      break
  }
}
