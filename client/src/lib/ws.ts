/**
 * `RoomSocket`: one websocket to one room, with the reconnect flow from section 3 of
 * ideas/architecture.md.
 *
 *   1. On close or error, wait `min(8000, 500 * 2^attempt)` ms plus 0–250 ms of jitter,
 *      reconnect, send `hello`. The attempt counter resets to 0 after a `welcome`.
 *   2. On `welcome`, the caller replaces all local state with the snapshot.
 *   3. On `visibilitychange` to visible, reconnect immediately if the socket is not
 *      open — phones lock between questions and the backoff timer may be minutes out.
 *   4. Send `ping` every 30 s; if no `pong` within 10 s, close the socket, which drops
 *      into step 1. A socket that a sleeping network has killed still reports `OPEN`,
 *      so this is the only thing that notices.
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

  readonly #onVisible = (): void => {
    if (this.#stopped || document.visibilityState !== 'visible') return
    // CONNECTING counts as "not lost": a second socket would not arrive any sooner.
    if (this.#socket !== null && this.#socket.readyState <= WebSocket.OPEN) return
    this.#clearReconnect()
    this.#connect()
  }

  constructor(code: string, session: string, handlers: RoomSocketHandlers) {
    this.#code = code
    this.#session = session
    this.#handlers = handlers
  }

  open(): void {
    if (this.#stopped) return
    document.addEventListener('visibilitychange', this.#onVisible)
    this.#connect()
  }

  /** Tear down for good: no more reconnects, no more handler calls. */
  close(): void {
    if (this.#stopped) return
    this.#stopped = true
    document.removeEventListener('visibilitychange', this.#onVisible)
    this.#clearReconnect()
    this.#stopHeartbeat()
    this.#drop(1000, 'client closed')
    this.#setState('closed')
  }

  /** `true` if the frame went out. A queued send would arrive after a `welcome` replaced
   * the state it was about, so a lost frame is dropped rather than buffered. */
  send(message: ClientMessage): boolean {
    if (this.#socket === null || this.#socket.readyState !== WebSocket.OPEN) return false
    this.#socket.send(JSON.stringify(message))
    return true
  }

  get state(): ConnectionState {
    return this.#state
  }

  // --- internals -------------------------------------------------------------------

  #connect(): void {
    if (this.#stopped) return
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
      this.send({ t: 'hello', session: this.#session })
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
        document.removeEventListener('visibilitychange', this.#onVisible)
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
    let message: ServerMessage
    try {
      message = JSON.parse(raw) as ServerMessage
    } catch {
      return // Not our frame. The server only sends JSON; ignoring beats crashing.
    }
    if (message.t === 'pong') {
      this.#clearPongTimer()
    } else if (message.t === 'welcome') {
      this.#attempt = 0 // Section 3 step 1: a welcome is what proves the link works.
      this.#setState('open')
      this.#startHeartbeat()
    }
    this.#handlers.onMessage(message)
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
      if (!this.send({ t: 'ping' })) return
      if (this.#pong !== null) return // A pong is already overdue; one timer is enough.
      this.#pong = setTimeout(() => {
        this.#pong = null
        // Silent for 10 s. The socket may still claim to be OPEN; close it so that
        // `onclose` runs the backoff.
        this.#drop(1000, 'pong timeout')
        this.#scheduleReconnect()
      }, PONG_TIMEOUT_MS)
    }, PING_INTERVAL_MS)
  }

  #stopHeartbeat(): void {
    if (this.#ping !== null) {
      clearInterval(this.#ping)
      this.#ping = null
    }
    this.#clearPongTimer()
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
