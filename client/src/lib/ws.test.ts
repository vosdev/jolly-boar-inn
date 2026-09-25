/**
 * `RoomSocket` against a fake `WebSocket` that stays `OPEN` and answers nothing unless a
 * test says so: the socket a phone wakes up holding after its network changed under it.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ClientMessage, ServerMessage } from './protocol'
import { ANSWER_TIMEOUT_MS, PROBE_TIMEOUT_MS, RoomSocket, type ConnectionState } from './ws'

/** The longest the backoff waits on a first retry: 500 ms plus 250 ms of jitter. */
const FIRST_RETRY_MS = 750

class FakeSocket {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3
  static made: FakeSocket[] = []

  readyState = FakeSocket.CONNECTING
  sent: ClientMessage[] = []
  onopen: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onclose: ((event: { code: number; reason: string }) => void) | null = null
  onerror: (() => void) | null = null

  constructor(readonly url: string) {
    FakeSocket.made.push(this)
  }

  send(data: string): void {
    this.sent.push(JSON.parse(data) as ClientMessage)
  }

  close(): void {
    this.readyState = FakeSocket.CLOSED
  }

  accept(): void {
    this.readyState = FakeSocket.OPEN
    this.onopen?.()
  }

  receive(message: Partial<ServerMessage> & { t: ServerMessage['t'] }): void {
    this.onmessage?.({ data: JSON.stringify(message) })
  }
}

const welcome = {
  t: 'welcome',
  room: null,
  you: null,
  players: [],
  question: null,
  your_answer: null,
  standings: [],
  server_time: new Date(0).toISOString(),
  server_version: __APP_VERSION__,
} as unknown as ServerMessage

let states: ConnectionState[]
let received: ServerMessage[]
let live: RoomSocket

function latest(): FakeSocket {
  return FakeSocket.made[FakeSocket.made.length - 1]!
}

/** A socket that has said hello and been welcomed. */
function welcomed(): FakeSocket {
  live.open()
  const socket = latest()
  socket.accept()
  socket.receive(welcome)
  return socket
}

beforeEach(() => {
  vi.useFakeTimers()
  FakeSocket.made = []
  vi.stubGlobal('WebSocket', FakeSocket)
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
  states = []
  received = []
  live = new RoomSocket('OAK', 'secret', {
    onMessage: (message) => received.push(message),
    onState: (state) => states.push(state),
    onClosed: () => {},
  })
})

afterEach(() => {
  live.close()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('RoomSocket', () => {
  it('sends nothing but hello before the welcome, so a tap then is refused', () => {
    live.open()
    const socket = latest()
    socket.accept()
    expect(live.send({ t: 'ready', ready: true })).toBe(false)
    expect(live.send({ t: 'answer', question_id: 'q', value: 1 })).toBe(false)
    expect(socket.sent).toEqual([{ t: 'hello', session: 'secret' }])
    socket.receive(welcome)
    expect(live.send({ t: 'ready', ready: true })).toBe(true)
    expect(socket.sent.at(-1)).toEqual({ t: 'ready', ready: true })
  })

  it('probes a socket that claims to be open when the tab comes back, and replaces a silent one', async () => {
    const socket = welcomed()
    document.dispatchEvent(new Event('visibilitychange'))
    expect(socket.sent.at(-1)).toEqual({ t: 'ping' })
    await vi.advanceTimersByTimeAsync(PROBE_TIMEOUT_MS - 1)
    expect(FakeSocket.made).toHaveLength(1)
    expect(states.at(-1)).toBe('open')
    await vi.advanceTimersByTimeAsync(1)
    expect(states.at(-1)).toBe('reconnecting')
    expect(socket.readyState).toBe(FakeSocket.CLOSED)
    await vi.advanceTimersByTimeAsync(FIRST_RETRY_MS)
    expect(FakeSocket.made).toHaveLength(2)
  })

  it('probes on the online event too', async () => {
    const socket = welcomed()
    window.dispatchEvent(new Event('online'))
    expect(socket.sent.at(-1)).toEqual({ t: 'ping' })
    await vi.advanceTimersByTimeAsync(PROBE_TIMEOUT_MS + FIRST_RETRY_MS)
    expect(FakeSocket.made).toHaveLength(2)
  })

  it('takes any frame as proof the socket is alive', async () => {
    const socket = welcomed()
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(PROBE_TIMEOUT_MS / 2)
    socket.receive({ t: 'answer_count', question_id: 'q', answered: 1, of: 3 })
    await vi.advanceTimersByTimeAsync(PROBE_TIMEOUT_MS * 3)
    expect(FakeSocket.made).toHaveLength(1)
    expect(states.at(-1)).toBe('open')
  })

  it('reconnects when an answer gets neither an ack nor an error', async () => {
    const socket = welcomed()
    expect(live.send({ t: 'answer', question_id: 'q', value: 1 })).toBe(true)
    // Other frames keep coming; only the reply to the answer counts here.
    socket.receive({ t: 'answer_count', question_id: 'q', answered: 1, of: 3 })
    await vi.advanceTimersByTimeAsync(ANSWER_TIMEOUT_MS - 1)
    expect(FakeSocket.made).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1 + FIRST_RETRY_MS)
    expect(FakeSocket.made).toHaveLength(2)
    expect(received.map((message) => message.t)).toEqual(['welcome', 'answer_count'])
  })

  it('keeps the socket when the answer is acked or refused', async () => {
    const socket = welcomed()
    live.send({ t: 'answer', question_id: 'q', value: 1 })
    socket.receive({ t: 'error', code: 'not_open', message: 'no question is open' })
    live.send({ t: 'answer', question_id: 'q', value: 1 })
    await vi.advanceTimersByTimeAsync(ANSWER_TIMEOUT_MS - 1)
    socket.receive({
      t: 'answer_ack',
      question_id: 'q',
      scoring: 'speed',
      band: 1,
      answered: 1,
      of: 1,
    })
    await vi.advanceTimersByTimeAsync(ANSWER_TIMEOUT_MS * 2)
    expect(FakeSocket.made).toHaveLength(1)
    expect(states.at(-1)).toBe('open')
  })

  it('reconnects at once when the tab comes back to a socket that is gone', async () => {
    const socket = welcomed()
    socket.readyState = FakeSocket.CLOSED
    document.dispatchEvent(new Event('visibilitychange'))
    expect(FakeSocket.made).toHaveLength(2)
  })
})
