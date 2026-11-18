/** Frames in, store values out, for the frames that patch state rather than replace it. */

import { get } from 'svelte/store'
import { beforeEach, describe, expect, it } from 'vitest'

import { errorText } from './errors'
import { pastGames } from './history'
import type {
  OpenQuestion,
  PlayerView,
  RoomView,
  ServerMessage,
  Standing,
  TeamStanding,
} from './protocol'
import {
  answerAck,
  answerCount,
  applyServerMessage,
  endedLive,
  lastClosed,
  lastError,
  players,
  question,
  requestsSettled,
  resetRoom,
  room,
  standings,
  teamStandings,
  you,
} from './stores'

const me: PlayerView = {
  id: 'p1',
  display_name: 'Zezima',
  role: 'player',
  connected: true,
  ready: false,
  avatar: null,
  editing: false,
  team: null,
  item: null,
}
const host: PlayerView = { ...me, id: 'p0', display_name: 'Host', role: 'admin' }

const lobby: RoomView = {
  code: 'OAK',
  status: 'lobby',
  settings: {} as RoomView['settings'],
  current_index: null,
  total: 3,
  events: 0,
  phase: 'idle',
  next_at: null,
  reveal_seconds: null,
  estimated_seconds: 0,
  played: [],
  segment: null,
  finished_at: null,
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
    waiting: [],
    picture: null,
    random_event: null,
    answerable_at: new Date(0).toISOString(),
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
    team_standings: null,
    server_time: new Date(0).toISOString(),
    server_version: __APP_VERSION__,
    ...patch,
  }
}

beforeEach(() => {
  resetRoom()
})

describe('applyServerMessage', () => {
  it('takes the standings a room_updated carries, and keeps them when it carries none', () => {
    const ranked: Standing[] = [
      {
        player_id: 'p1',
        display_name: 'Me',
        avatar: null,
        points: 10,
        rank: 1,
        points_gained: 0,
        previous_rank: 1,
      },
    ]
    applyServerMessage(welcome())
    applyServerMessage({ t: 'room_updated', room: lobby, players: [host, me], standings: ranked })
    expect(get(standings)).toEqual(ranked)
    applyServerMessage({ t: 'room_updated', room: lobby, players: [host, me] })
    expect(get(standings)).toEqual(ranked)
  })

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
    expect(get(answerCount)).toEqual({ answered: 0, of: 2, waiting: [] })
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

  it('keeps who is still to answer from answer_count through our own ack', () => {
    applyServerMessage(welcome({ question: { ...open('q1'), waiting: ['a', 'b', 'c'] } }))
    expect(get(answerCount)?.waiting).toEqual(['a', 'b', 'c'])
    applyServerMessage({
      t: 'answer_count',
      question_id: 'q1',
      answered: 1,
      of: 3,
      waiting: ['b', 'c'],
    })
    expect(get(answerCount)).toEqual({ answered: 1, of: 3, waiting: ['b', 'c'] })
    applyServerMessage({
      t: 'answer_ack',
      question_id: 'q1',
      scoring: 'speed',
      band: 2,
      answered: 2,
      of: 3,
    })
    expect(get(answerCount)).toEqual({ answered: 2, of: 3, waiting: ['b', 'c'] })
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
      unanswered: [],
      settled: {},
      question_id: 'q1',
      reveal: {},
      results: {},
      standings: [],
      team_standings: null,
      next_at: null,
      reveal_seconds: 8,
      picture: null,
    })
    applyServerMessage({ t: 'error', code: 'not_open', message: 'no question is open' })
    expect(errorText(get(lastError)!)).toBe('Too late, that question had closed.')
  })

  it('hands the reveal the picture a round held back while its question was open', () => {
    applyServerMessage(welcome({ room: { ...lobby, status: 'playing' } }))
    applyServerMessage({ t: 'question_open', question: open('q1') })
    applyServerMessage({
      t: 'question_closed',
      unanswered: [],
      settled: {},
      question_id: 'q1',
      reveal: {},
      results: {},
      standings: [],
      team_standings: null,
      next_at: null,
      reveal_seconds: 6,
      picture: 'feedc0de.png',
    })
    expect(get(lastClosed)?.was?.picture).toBe('feedc0de.png')
  })

  it('keeps how long the reveal lasts from its close until the next question opens', () => {
    applyServerMessage(welcome({ room: { ...lobby, status: 'playing' } }))
    applyServerMessage({ t: 'question_open', question: open('q1') })
    applyServerMessage({
      t: 'question_closed',
      unanswered: [],
      settled: {},
      question_id: 'q1',
      reveal: {},
      results: {},
      standings: [],
      team_standings: null,
      next_at: new Date(Date.now() + 16_000).toISOString(),
      reveal_seconds: 16,
      picture: null,
    })
    expect(get(room)?.reveal_seconds).toBe(16)
    applyServerMessage({ t: 'question_open', question: open('q2') })
    expect(get(room)?.reveal_seconds).toBeNull()
  })
})

describe('a finished game', () => {
  const FINISHED: RoomView = {
    ...lobby,
    status: 'finished',
    finished_at: '2026-10-01T20:05:00.123456Z',
  }
  const FINAL: Standing[] = [
    {
      player_id: 'p0',
      display_name: 'Host',
      points: 900,
      rank: 1,
      points_gained: 900,
      previous_rank: null,
      avatar: null,
    },
    {
      player_id: 'p1',
      display_name: 'Zezima',
      points: 400,
      rank: 2,
      points_gained: 400,
      previous_rank: null,
      avatar: null,
    },
  ]

  beforeEach(() => {
    resetRoom()
    localStorage.clear()
  })

  it('is filed the same in every browser, whether it saw the end or slept through it', () => {
    // The host saw the last question close.
    applyServerMessage(welcome({ you: host, room: { ...lobby, status: 'playing' } }))
    applyServerMessage({ t: 'room_updated', room: FINISHED, players: [host, me] })
    applyServerMessage({ t: 'game_finished', standings: FINAL, team_standings: null })
    const there = pastGames()

    // Another browser: its phone locked, and it reconnects into the finished room.
    resetRoom()
    localStorage.clear()
    applyServerMessage(welcome({ room: FINISHED, standings: FINAL }))
    const asleep = pastGames()

    expect(there).toHaveLength(1)
    expect(asleep).toHaveLength(1)
    expect(asleep[0]?.standings).toEqual(there[0]?.standings)
    expect(asleep[0]?.standings).toEqual(FINAL)
    expect(asleep[0]?.finishedAt).toBe(there[0]?.finishedAt)
    expect([there[0]?.youId, asleep[0]?.youId]).toEqual(['p0', 'p1'])
  })

  it('plays the ceremony only for a browser that saw the end, from the frame saying so', () => {
    applyServerMessage(welcome({ you: host, room: { ...lobby, status: 'playing' } }))
    expect(get(endedLive)).toBe(false)
    applyServerMessage({ t: 'room_updated', room: FINISHED, players: [host, me] })
    expect(get(endedLive)).toBe(true)

    resetRoom()
    applyServerMessage(welcome({ room: FINISHED, standings: FINAL }))
    expect(get(endedLive)).toBe(false)
  })

  it('files a team game with its teams and each player’s team, and a normal game with none', () => {
    const TEAMS: TeamStanding[] = [
      { team: 'zamorak', points: 900, rank: 1, points_gained: 900, previous_rank: null },
      { team: 'saradomin', points: 400, rank: 2, points_gained: 400, previous_rank: null },
    ]
    const sara = { ...me, team: 'saradomin' as const }
    const zam = { ...host, team: 'zamorak' as const }
    applyServerMessage(
      welcome({ you: sara, players: [zam, sara], room: { ...lobby, status: 'playing' } }),
    )
    applyServerMessage({ t: 'room_updated', room: FINISHED, players: [zam, sara] })
    applyServerMessage({ t: 'game_finished', standings: FINAL, team_standings: TEAMS })
    expect(get(teamStandings)).toEqual(TEAMS)
    expect(pastGames()[0]?.teamStandings).toEqual(TEAMS)
    expect(pastGames()[0]?.teams).toEqual({ p0: 'zamorak', p1: 'saradomin' })

    resetRoom()
    localStorage.clear()
    expect(get(teamStandings)).toBeNull()
    applyServerMessage(welcome({ room: FINISHED, standings: FINAL }))
    expect(pastGames()[0]?.teamStandings).toBeNull()
    expect(pastGames()[0]?.teams).toEqual({})
  })

  it('keeps each game of a rematch, and leaves the last one behind in the lobby', () => {
    applyServerMessage(welcome({ you: host, room: { ...lobby, status: 'playing' } }))
    applyServerMessage({ t: 'room_updated', room: FINISHED, players: [host, me] })
    applyServerMessage({ t: 'game_finished', standings: FINAL, team_standings: null })
    const zero = FINAL.map((s) => ({ ...s, points: 0, points_gained: 0, rank: 1 }))
    applyServerMessage({ t: 'room_updated', room: lobby, players: [host, me], standings: zero })
    expect(get(endedLive)).toBe(false)
    expect(get(standings)).toEqual(zero)
    expect(get(lastClosed)).toBeNull()

    const again = { ...FINISHED, finished_at: '2026-10-01T20:30:00Z' }
    applyServerMessage({
      t: 'room_updated',
      room: { ...lobby, status: 'playing' },
      players: [host, me],
    })
    applyServerMessage({ t: 'room_updated', room: again, players: [host, me] })
    applyServerMessage({ t: 'game_finished', standings: FINAL, team_standings: null })
    expect(pastGames().map((g) => g.finishedAt)).toEqual([again.finished_at, FINISHED.finished_at])
  })

  it('is not filed while the room is still being played', () => {
    applyServerMessage(welcome({ room: { ...lobby, status: 'playing' }, standings: FINAL }))
    expect(pastGames()).toEqual([])
  })
})
