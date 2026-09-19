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

import { writable } from 'svelte/store'

import type {
  OpenQuestion,
  PlayerView,
  ProtocolError,
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
export const connection = writable<ConnectionState>('connecting')
/** The last rejected message. Screens show it and clear it; nothing else depends on it. */
export const lastError = writable<ProtocolError | null>(null)

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

/** Drop everything. Called when leaving a room, so the next one starts clean. */
export function resetRoom(): void {
  room.set(null)
  you.set(null)
  players.set([])
  question.set(null)
  yourAnswer.set(null)
  standings.set([])
  lastError.set(null)
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
      yourAnswer.set(message.your_answer)
      standings.set(message.standings)
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
      yourAnswer.set(null)
      break

    case 'question_closed':
      // The question is behind us. A client that reconnects during a reveal is sent
      // `question: null` too, so this leaves both paths in the same state. T13 adds the
      // reveal and per-player results this frame also carries.
      question.set(null)
      standings.set(message.standings)
      break

    case 'game_finished':
      question.set(null)
      standings.set(message.standings)
      break

    case 'answer_ack':
      break // T13: the speed bucket, on the answered state.

    case 'pong':
      noteServerTime(message.server_time)
      break

    case 'error':
      lastError.set(message)
      break
  }
}
