/**
 * `RoomSocket`: one websocket to one room, with the reconnect flow from "Reconnect and
 * restart" in ideas/architecture.md.
 *
 *   1. On close or error, wait `min(8000, 500 * 2^attempt)` ms plus 0–250 ms of jitter,
 *      reconnect, send `hello`. No `welcome` within 10 s drops the socket and backs off.
 *      The attempt counter resets to 0 once a welcomed socket has stayed up 10 s.
 *   2. On `welcome`, the caller replaces all local state with the snapshot.
 *   3. On `visibilitychange` to visible or the `online` event, reconnect immediately if
 *      the socket is not open — phones lock between questions and the backoff timer may
 *      be minutes out. If it claims to be open, send a `ping` at once and reconnect if
 *      nothing arrives within 4 s: a socket a sleeping network killed still says `OPEN`.
 *   4. Send `ping` every 30 s; if no `pong` within 10 s, reconnect. Any frame at all
 *      proves the socket alive, for this and for step 3.
 *   5. An `answer` that gets no `answer_ack` or `error` within 5 s reconnects too, so the
 *      `welcome` says whether it landed rather than the screen showing it sent.
 *
 * Nothing but `hello` and those pings goes out before `welcome`: a frame sent then is
 * about a screen the snapshot is about to replace.
 *
 * The session token authenticates in the first frame and never in the URL, so nothing
 * here appends it to `/ws/{code}`.
 *
 * This module is transport only: it knows `hello`, `ping` and `pong`, and hands every
 * other frame to its caller. `stores.ts` is what turns those into state.
 */

import type { ClientMessage, ServerMessage } from './protocol'

const PING_INTERVAL_MS = 30_000
const PONG_TIMEOUT_MS = 10_000
export const WELCOME_TIMEOUT_MS = 10_000
/** A welcome alone does not prove the link: the server can welcome a socket and close it
 * straight after (a full outbox, the connect limit), and resetting then loops at speed. */
export const STABLE_MS = 10_000
export const PROBE_TIMEOUT_MS = 4_000
export const ANSWER_TIMEOUT_MS = 5_000
const BACKOFF_BASE_MS = 500
const BACKOFF_CEILING_MS = 8_000
const BACKOFF_JITTER_MS = 250
/** `2 ** attempt` past the ceiling changes nothing; stop counting rather than reach Infinity. */
const MAX_ATTEMPT = 16

export type ConnectionState =
  /** No socket yet, or one that has not been welcomed. */
  | 'connecting'
  /** Welcomed: the room state is live. */
  | 'open'
  /** Lost, waiting out the backoff. Whatever is on screen is the last known state. */
  | 'reconnecting'
  /** Given up, or torn down. Nothing will arrive. */
  | 'closed'

/** Why a socket will not come back. The close codes are the server's, from section 3. */
export type ClosureReason =
  | 'replaced' // 4000: this session opened a socket somewhere else; last device wins
  | 'bad_session' // 4001: the stored session is not a player in this room
  | 'kicked' // 4003
  | 'no_room' // 4004: unknown or expired
  | 'protocol' // 4008: we sent something the server would not parse — a bug here
  | 'stopped' // the caller closed it

const TERMINAL: ReadonlyMap<number, ClosureReason> = new Map([
  [4000, 'replaced'],
  [4001, 'bad_session'],
  [4003, 'kicked'],
  [4004, 'no_room'],
  [4008, 'protocol'],
])

export interface RoomSocketHandlers {
  /** Every frame except the `pong`s this module asked for. */
  onMessage: (message: ServerMessage) => void
  onState: (state: ConnectionState) => void
  /** A close we will not retry. The socket is finished after this. */
  onClosed: (reason: ClosureReason, detail: string) => void
}

function socketUrl(code: string): string {
  const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${scheme}//${location.host}/ws/${encodeURIComponent(code)}`
}

export function backoffMs(attempt: number): number {
  const base = Math.min(BACKOFF_CEILING_MS, BACKOFF_BASE_MS * 2 ** attempt)
  return base + Math.random() * BACKOFF_JITTER_MS
}

export class RoomSocket {
  readonly #code: string
  readonly #session: string
  readonly #handlers: RoomSocketHandlers

  #socket: WebSocket | null = null
  #attempt = 0
  #state: ConnectionState = 'connecting'
  #stopped = false

  #reconnect: ReturnType<typeof setTimeout> | null = null
  #ping: ReturnType<typeof setInterval> | null = null
  #pong: ReturnType<typeof setTimeout> | null = null
  #probe: ReturnType<typeof setTimeout> | null = null
  #answer: ReturnType<typeof setTimeout> | null = null
  #welcome: ReturnType<typeof setTimeout> | null = null
  #stable: ReturnType<typeof setTimeout> | null = null

  readonly #onVisible = (): void => {
    if (document.visibilityState === 'visible') this.#check()
  }

  readonly #onOnline = (): void => {
    this.#check()
  }

  constructor(code: string, session: string, handlers: RoomSocketHandlers) {
    this.#code = code
    this.#session = session
    this.#handlers = handlers
  }

  open(): void {
    if (this.#stopped) return
    document.addEventListener('visibilitychange', this.#onVisible)
    window.addEventListener('online', this.#onOnline)
    this.#connect()
  }

  /** Tear down for good: no more reconnects, no more handler calls. */
  close(): void {
    if (this.#stopped) return
    this.#stopped = true
    this.#unlisten()
    this.#clearReconnect()
    this.#stopHeartbeat()
    this.#drop(1000, 'client closed')
    this.#setState('closed')
  }

  /** `true` if the frame went out. Only once welcomed: a queued send would arrive after a
   * `welcome` replaced the state it was about, so it is refused rather than buffered. */
  send(message: ClientMessage): boolean {
    if (this.#state !== 'open' || !this.#write(message)) return false
    if (message.t === 'answer' && this.#answer === null) {
      this.#answer = setTimeout(() => {
        this.#answer = null
        this.#lost('answer timeout')
      }, ANSWER_TIMEOUT_MS)
    }
    return true
  }

  get state(): ConnectionState {
    return this.#state
  }

  // --- internals -------------------------------------------------------------------

  #connect(): void {
    if (this.#stopped) return
    this.#stopHeartbeat()
    this.#drop(1000, 'reconnecting')
    this.#setState(this.#attempt === 0 ? 'connecting' : 'reconnecting')

    let socket: WebSocket
    try {
      socket = new WebSocket(socketUrl(this.#code))
    } catch {
      this.#scheduleReconnect()
      return
    }
    this.#socket = socket

    socket.onopen = () => {
      if (socket !== this.#socket) return
      this.#write({ t: 'hello', session: this.#session })
      this.#welcome = setTimeout(() => {
        this.#welcome = null
        this.#lost('welcome timeout')
      }, WELCOME_TIMEOUT_MS)
    }
    socket.onmessage = (event: MessageEvent<string>) => {
      if (socket === this.#socket) this.#receive(event.data)
    }
    socket.onclose = (event: CloseEvent) => {
      if (socket !== this.#socket) return
      this.#socket = null
      this.#stopHeartbeat()
      const terminal = TERMINAL.get(event.code)
      if (terminal !== undefined) {
        this.#stopped = true
        this.#unlisten()
        this.#setState('closed')
        this.#handlers.onClosed(terminal, event.reason)
        return
      }
      this.#scheduleReconnect()
    }
    // A failed socket always fires `close` after `error`, and that is where the
    // reconnect lives. Swallowing it here keeps one path into the backoff.
    socket.onerror = () => {}
  }

  #receive(raw: string): void {
    this.#clearPongTimer()
    this.#clearProbe()
    let message: ServerMessage
    try {
      message = JSON.parse(raw) as ServerMessage
    } catch {
      return // Not our frame. The server only sends JSON; ignoring beats crashing.
    }
    if (message.t === 'answer_ack' || message.t === 'error') {
      this.#clearAnswerTimer()
    } else if (message.t === 'welcome') {
      this.#setState('open')
      this.#startHeartbeat()
      this.#stable = setTimeout(() => {
        this.#stable = null
        this.#attempt = 0
      }, STABLE_MS)
    }
    this.#handlers.onMessage(message)
  }

  /** Is the socket still there? Reconnect now if it is gone, and ask it if it says so. */
  #check(): void {
    if (this.#stopped) return
    const socket = this.#socket
    if (socket === null || socket.readyState > WebSocket.OPEN) {
      this.#clearReconnect()
      this.#connect()
      return
    }
    // CONNECTING counts as "not lost": a second socket would not arrive any sooner.
    if (socket.readyState !== WebSocket.OPEN || this.#probe !== null) return
    if (!this.#write({ t: 'ping' })) return
    this.#probe = setTimeout(() => {
      this.#probe = null
      this.#lost('probe timeout')
    }, PROBE_TIMEOUT_MS)
  }

  /** A socket that went quiet. It may still claim to be OPEN; close it and back off. */
  #lost(reason: string): void {
    this.#stopHeartbeat()
    this.#drop(1000, reason)
    this.#scheduleReconnect()
  }

  /** Straight onto the socket, welcomed or not. `false` if there is no open socket. */
  #write(message: ClientMessage): boolean {
    if (this.#socket === null || this.#socket.readyState !== WebSocket.OPEN) return false
    this.#socket.send(JSON.stringify(message))
    return true
  }

  #unlisten(): void {
    document.removeEventListener('visibilitychange', this.#onVisible)
    window.removeEventListener('online', this.#onOnline)
  }

  #scheduleReconnect(): void {
    if (this.#stopped || this.#reconnect !== null) return
    this.#setState('reconnecting')
    const wait = backoffMs(this.#attempt)
    this.#attempt = Math.min(this.#attempt + 1, MAX_ATTEMPT)
    this.#reconnect = setTimeout(() => {
      this.#reconnect = null
      this.#connect()
    }, wait)
  }

  #startHeartbeat(): void {
    this.#stopHeartbeat()
    this.#ping = setInterval(() => {
      if (!this.#write({ t: 'ping' })) return
      if (this.#pong !== null) return // A pong is already overdue; one timer is enough.
      this.#pong = setTimeout(() => {
        this.#pong = null
        this.#lost('pong timeout')
      }, PONG_TIMEOUT_MS)
    }, PING_INTERVAL_MS)
  }

  /** Every timer that watches the current socket; the next one starts clean. */
  #stopHeartbeat(): void {
    if (this.#ping !== null) {
      clearInterval(this.#ping)
      this.#ping = null
    }
    this.#clearPongTimer()
    this.#clearProbe()
    this.#clearAnswerTimer()
    for (const timer of [this.#welcome, this.#stable]) if (timer !== null) clearTimeout(timer)
    this.#welcome = null
    this.#stable = null
  }

  #clearProbe(): void {
    if (this.#probe !== null) {
      clearTimeout(this.#probe)
      this.#probe = null
    }
  }

  #clearAnswerTimer(): void {
    if (this.#answer !== null) {
      clearTimeout(this.#answer)
      this.#answer = null
    }
  }

  #clearPongTimer(): void {
    if (this.#pong !== null) {
      clearTimeout(this.#pong)
      this.#pong = null
    }
  }

  #clearReconnect(): void {
    if (this.#reconnect !== null) {
      clearTimeout(this.#reconnect)
      this.#reconnect = null
    }
  }

  /** Detach and close the current socket without letting its `onclose` run. */
  #drop(code: number, reason: string): void {
    const socket = this.#socket
    if (socket === null) return
    this.#socket = null
    socket.onopen = null
    socket.onmessage = null
    socket.onclose = null
    socket.onerror = null
    try {
      socket.close(code, reason)
    } catch {
      // Already closing.
    }
  }

  #setState(state: ConnectionState): void {
    if (this.#state === state) return
    this.#state = state
    this.#handlers.onState(state)
  }
}
