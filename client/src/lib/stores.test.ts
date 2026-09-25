/** Frames in, store values out, for the frames that patch state rather than replace it. */

import { get } from 'svelte/store'
import { beforeEach, describe, expect, it } from 'vitest'

import { errorText } from './errors'
import type { OpenQuestion, PlayerView, RoomView, ServerMessage } from './protocol'
import {
  answerAck,
  answerCount,
  applyServerMessage,
  lastError,
  players,
  question,
  requestsSettled,
  resetRoom,
  room,
  you,
} from './stores'

const me: PlayerView = {
  id: 'p1',
  display_name: 'Zezima',
  role: 'player',
  connected: true,
  ready: false,
}
const host: PlayerView = { ...me, id: 'p0', display_name: 'Host', role: 'admin' }

const lobby: RoomView = {
  code: 'OAK',
  status: 'lobby',
  settings: {} as RoomView['settings'],
  current_index: null,
  total: 3,
  phase: 'idle',
  next_at: null,
  segment: null,
}

function open(id: string): OpenQuestion {
  return {
    question_id: id,
    index: 0,
    total: 3,
    type: 'more_less',
    mode: 'more_less',
    segment: { mode: 'more_less', index: 0, total: 1, start: 0, count: 3 },
    view: {},
    opened_at: new Date(0).toISOString(),
    ends_at: new Date(10_000).toISOString(),
    you_can_answer: true,
    answered: 0,
    of: 2,
  }
}

function welcome(patch: Partial<Extract<ServerMessage, { t: 'welcome' }>> = {}): ServerMessage {
  return {
    t: 'welcome',
    room: lobby,
    you: me,
    players: [host, me],
    question: null,
    your_answer: null,
    standings: [],
    server_time: new Date(0).toISOString(),
    server_version: __APP_VERSION__,
    ...patch,
  }
}

beforeEach(() => {
  resetRoom()
})

describe('applyServerMessage', () => {
  it('takes the players, and us among them, from players_updated and leaves the room be', () => {
    applyServerMessage(welcome())
    const readied = { ...me, ready: true }
    applyServerMessage({ t: 'players_updated', players: [host, readied] })
    expect(get(players)).toEqual([host, readied])
    expect(get(you)).toEqual(readied)
    expect(get(room)).toEqual(lobby)
  })

  it('drops an answer_ack for a question that is no longer open', () => {
    applyServerMessage(welcome({ question: open('q1') }))
    applyServerMessage({ t: 'question_open', question: open('q2') })
    applyServerMessage({
      t: 'answer_ack',
      question_id: 'q1',
      scoring: 'speed',
      band: 1,
      answered: 2,
      of: 2,
    })
    expect(get(answerAck)).toBeNull()
    expect(get(answerCount)).toEqual({ answered: 0, of: 2 })
    applyServerMessage({
      t: 'answer_ack',
      question_id: 'q2',
      scoring: 'speed',
      band: 3,
      answered: 1,
      of: 2,
    })
    expect(get(answerAck)).toEqual({ scoring: 'speed', band: 3 })
    expect(get(question)?.question_id).toBe('q2')
  })

  it('counts every welcome and error as settling whatever was waiting', () => {
    const before = get(requestsSettled)
    applyServerMessage(welcome())
    applyServerMessage({ t: 'error', code: 'bad_state', message: 'wait a moment' })
    applyServerMessage({ t: 'players_updated', players: [host, me] })
    expect(get(requestsSettled)).toBe(before + 2)
  })

  it('takes a refusal down when the next question opens', () => {
    applyServerMessage(welcome({ question: open('q1') }))
    applyServerMessage({ t: 'error', code: 'not_open', message: 'no question is open' })
    expect(get(lastError)?.code).toBe('not_open')
    applyServerMessage({ t: 'question_open', question: open('q2') })
    expect(get(lastError)).toBeNull()
  })

  it('tells a refusal before an event’s answers from one after its close', () => {
    const now = Date.now()
    const held = {
      ...open('q1'),
      answerable_at: new Date(now + 5_000).toISOString(),
      ends_at: new Date(now + 15_000).toISOString(),
    }
    applyServerMessage(welcome({ question: held, server_time: new Date(now).toISOString() }))
    applyServerMessage({ t: 'error', code: 'not_open', message: 'not taking answers yet' })
    expect(errorText(get(lastError)!)).toBe("Hold on, answers aren't open yet.")
    applyServerMessage({
      t: 'question_closed',
      question_id: 'q1',
      reveal: {},
      results: {},
      standings: [],
      next_at: null,
    })
    applyServerMessage({ t: 'error', code: 'not_open', message: 'no question is open' })
    expect(errorText(get(lastError)!)).toBe('Too late, that question had closed.')
  })
})
