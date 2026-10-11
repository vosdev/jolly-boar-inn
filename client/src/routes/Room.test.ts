/**
 * The room screen in and around the `standings` phase, fed frames straight through
 * `applyServerMessage` with the socket mocked out.
 *
 * Between rounds the Wise Old Man's hiscores are the screen, under a timer to the next round. Inside a
 * round there is no board under the reveal. And a phase this build does not know falls
 * through to the waiting screen, which is what a build from before `standings` does
 * with that phase.
 */

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte'
import { type Component, tick } from 'svelte'
import { get } from 'svelte/store'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { OpenQuestion, RoomView, Standing, Welcome } from '../lib/protocol'
import { TYPE_VIEWS } from '../components/questions/index'
import type { TypeViewProps } from '../components/questions/props'
import { HISCORES_HOST } from '../lib/hiscores'
import { RETURN_MS } from '../lib/interlude'
import { MODES } from '../lib/modes'
import { npcArt } from '../lib/npcs'
import { HOST_IN_MS, HOST_OUT_MS, MOVE_MS, WORDS_OUT_MS } from '../lib/stageMoves'
import { applyServerMessage, connection, resetRoom } from '../lib/stores'
import { timerBar } from '../lib/timerbar'
import { stubAnimations } from '../test-animate'
import { clearVocabCache } from '../lib/vocab'
import { savePastGame } from '../lib/history'
import type { RoomSocketHandlers } from '../lib/ws'
import Room from './Room.svelte'

vi.mock('../lib/session', async (importOriginal) => {
  const real = await importOriginal<typeof import('../lib/session')>()
  return { ...real, getSession: () => 'session' }
})

const sent: unknown[] = []
let closeSocket: RoomSocketHandlers['onClosed'] = () => {}

vi.mock('../lib/ws', () => ({
  RoomSocket: class {
    constructor(_code: string, _session: string, handlers: RoomSocketHandlers) {
      closeSocket = handlers.onClosed
    }
    open(): void {}
    close(): void {}
    send(message: unknown): boolean {
      sent.push(message)
      return true
    }
  },
}))

const SEGMENT = { mode: 'more_less', index: 0, total: 2, start: 0, count: 1 }

function roomView(patch: Partial<RoomView>): RoomView {
  return {
    code: 'ABYSSAL',
    status: 'playing',
    settings: {
      modes: [
        { mode: 'more_less', questions: 1 },
        { mode: 'price_is_right', questions: 1 },
      ],
      mode_order: 'listed',
      random_event_frequency: 'default',
      pace: 'run',
      standings_seconds: 10,
      close_when_all_answered: true,
      max_players: 50,
    },
    current_index: 0,
    total: 2,
    phase: 'standings',
    next_at: new Date(Date.now() + 10_000).toISOString(),
    reveal_seconds: null,
    segment: SEGMENT,
    finished_at: null,
    ...patch,
  }
}

const STANDINGS: Standing[] = [
  { player_id: 'a', display_name: 'Zezima', avatar: null, points: 1000, rank: 1, points_gained: 1000, previous_rank: null },
  { player_id: 'b', display_name: 'Woox', avatar: null, points: 0, rank: 2, points_gained: 0, previous_rank: null },
]

function welcome(room: RoomView, role: 'admin' | 'player' = 'player'): Welcome {
  const you = { id: 'a', display_name: 'Zezima', role, connected: true }
  return {
    t: 'welcome',
    room,
    you,
    players: [you, { id: 'b', display_name: 'Woox', role: 'player', connected: true }],
    question: null,
    your_answer: null,
    standings: STANDINGS,
    server_time: new Date().toISOString(),
    server_version: __APP_VERSION__,
  }
}

beforeEach(() => {
  sent.length = 0
})

function inSeconds(seconds: number): string {
  return new Date(Date.now() + seconds * 1000).toISOString()
}

async function arrive(message: Welcome): Promise<void> {
  render(Room, { code: 'ABYSSAL', navigate: () => {} })
  applyServerMessage(message)
  await screen.findByRole('heading', { level: 1 })
}

describe('Room', () => {
  it('spells the code in the address bar as the server does', async () => {
    history.replaceState(null, '', '/r/ABYSSAL')
    await arrive(welcome(roomView({ code: 'Abyssal' })))
    expect(location.pathname).toBe('/r/Abyssal')
  })

  it('shows the hiscores between rounds, with a timer to the next round', async () => {
    await arrive(welcome(roomView({})))
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(
      /After round 1 of 2\s*Standings/,
    )
    // The countdown is the bar under the top bar, which App draws from this store.
    expect(get(timerBar)?.label).toBe('to the next round')
    const rows = document.querySelectorAll('.hiscores tbody tr')
    expect([...rows].map((row) => row.querySelector('.name')?.textContent?.trim())).toEqual([
      'Zezima (you)',
      'Woox',
    ])
    expect(screen.getByRole('heading', { level: 2, name: 'Hiscores' })).toBeTruthy()
  })

  it('lets the host start the next round early', async () => {
    await arrive(welcome(roomView({}), 'admin'))
    screen.getByRole('button', { name: 'Start the next round now' }).click()
    expect(sent).toContainEqual({ t: 'skip', phase: 'standings', index: 0 })
  })

  it('draws no board under a reveal inside a round', async () => {
    const open: OpenQuestion = {
      question_id: 'q1',
      index: 0,
      total: 2,
      type: 'more_less',
      mode: 'more_less',
      segment: { ...SEGMENT, count: 2 },
      view: {
        metric: 'ge_price',
        direction: 'more',
        options: [{ subject: { name: 'Abyssal whip' } }, { subject: { name: 'Dragon bones' } }],
        as_of: '2026-09-01',
      },
      opened_at: new Date().toISOString(),
      ends_at: new Date(Date.now() + 10_000).toISOString(),
      you_can_answer: true,
    }
    await arrive(welcome(roomView({ phase: 'open', next_at: null })))
    applyServerMessage({ t: 'question_open', question: open })
    applyServerMessage({
      t: 'question_closed',
      question_id: 'q1',
      reveal: { ...open.view, answer_index: 0, values: [1, 2] },
      results: {},
      standings: STANDINGS,
      next_at: new Date(Date.now() + 8_000).toISOString(),
      reveal_seconds: 8,
    })
    await screen.findByText(/Question 1 of 2/)
    expect(document.querySelector('.hiscores')).toBeNull()
  })

  it('writes what we earned on the scroll for the reveal, without the total', async () => {
    const open: OpenQuestion = {
      question_id: 'q1',
      index: 0,
      total: 2,
      type: 'more_less',
      mode: 'more_less',
      segment: { ...SEGMENT, count: 2 },
      view: {
        metric: 'ge_price',
        direction: 'more',
        options: [{ subject: { name: 'Abyssal whip' } }, { subject: { name: 'Dragon bones' } }],
        as_of: '2026-09-01',
      },
      opened_at: new Date().toISOString(),
      ends_at: new Date(Date.now() + 10_000).toISOString(),
      you_can_answer: true,
      answered: 0,
      of: 2,
    }
    await arrive(welcome(roomView({ phase: 'open', next_at: null })))
    applyServerMessage({ t: 'question_open', question: open })
    await screen.findByText(/Question 1 of 2/)
    expect(get(timerBar)?.label).toBe('to answer')
    expect(document.querySelector('.slot')).toBeNull()

    // Answered and waiting: our answer held, and how the room is doing.
    screen.getByText('Abyssal whip').click()
    expect(sent).toContainEqual({ t: 'answer', question_id: 'q1', value: 0 })
    applyServerMessage({
      t: 'answer_ack',
      question_id: 'q1',
      scoring: 'speed',
      band: 2,
      answered: 1,
      of: 2,
    })
    await screen.findByText(/answered — waiting for the room/)
    expect(document.querySelector('.waiting .count')?.textContent).toBe('1 of 2')
    applyServerMessage({ t: 'answer_count', question_id: 'q1', answered: 2, of: 2 })
    await screen.findByText('2 of 2')

    applyServerMessage({
      t: 'question_closed',
      question_id: 'q1',
      reveal: { ...open.view, answer_index: 0 },
      results: { a: { value: 0, correct: true, credit: 1, points: 850 } },
      standings: [{ ...STANDINGS[0]!, points: 1850 }, STANDINGS[1]!],
      next_at: new Date(Date.now() + 16_000).toISOString(),
      reveal_seconds: 16,
    })
    await waitFor(() => expect(document.querySelector('.slot')).toBeTruthy())
    expect(document.querySelector('.slot .earned')?.textContent?.trim()).toBe('+850')
    // What we earned, and only that: the total waits for the standings.
    expect(document.querySelector('.slot .total')).toBeNull()
    expect(document.querySelector('.paper')!.contains(document.querySelector('.slot'))).toBe(true)
    expect(get(timerBar)?.label).toBe('to the next question')
    // The bar is full on this question's own reveal, which the frame says.
    expect(get(timerBar)?.totalSeconds).toBe(16)
  })

  it('says which question it is in the timer bar’s tab, and the round only on the splash', async () => {
    const open: OpenQuestion = {
      question_id: 'q1',
      index: 0,
      total: 2,
      type: 'more_less',
      mode: 'more_less',
      segment: { ...SEGMENT, count: 2 },
      view: {
        metric: 'ge_price',
        direction: 'more',
        options: [{ subject: { name: 'Abyssal whip' } }, { subject: { name: 'Dragon bones' } }],
        as_of: '2026-09-01',
      },
      opened_at: new Date().toISOString(),
      ends_at: new Date(Date.now() + 10_000).toISOString(),
      you_can_answer: true,
    }
    await arrive(welcome(roomView({ phase: 'open', next_at: null })))
    applyServerMessage({ t: 'question_open', question: open })
    const heading = await screen.findByRole('heading', { level: 1 })
    expect(heading.classList.contains('sr')).toBe(true)
    expect(get(timerBar)?.progress).toBe('1/2')

    applyServerMessage({
      t: 'question_closed',
      question_id: 'q1',
      reveal: { ...open.view, answer_index: 0 },
      results: { a: { value: 0, correct: true, credit: 1, points: 850 } },
      standings: [{ ...STANDINGS[0]!, points: 1850 }, STANDINGS[1]!],
      next_at: new Date(Date.now() + 8_000).toISOString(),
      reveal_seconds: 8,
    })
    await waitFor(() => expect(document.querySelector('.paper .slot')).toBeTruthy())
    expect(get(timerBar)?.progress).toBe('1/2')
    expect(screen.getByRole('heading', { level: 1 }).classList.contains('sr')).toBe(true)
    const drawnRound = [...document.body.querySelectorAll('*')].filter(
      (node) =>
        node.closest('.sr') === null &&
        [...node.childNodes].some(
          (child) => child.nodeType === Node.TEXT_NODE && /Round 1 of/.test(child.textContent ?? ''),
        ),
    )
    expect(drawnRound).toEqual([])
    expect(document.querySelector('.award')).toBeTruthy()
  })

  it('lands a reconnect inside an NPC’s hold on the card, with what is left of it', async () => {
    // Rebuilt from the welcome alone. The server's clock is a minute ahead of
    // this one and the hold has 1.5 seconds to go, so the buttons wait 1.5 seconds.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    try {
      const server = Date.parse('2026-09-22T20:00:00Z')
      vi.setSystemTime(server - 60_000)
      const held: OpenQuestion = {
        question_id: 'q_bob',
        index: 3,
        total: 11,
        type: 'multiple_choice',
        mode: 'random_event',
        segment: { mode: 'more_less', index: 0, total: 1, start: 0, count: 11 },
        view: { prompt: 'What amulet lets you talk to cats?', options: ['Catspeak', 'Camulet'] },
        random_event: 'bob',
        opened_at: new Date(server - 500).toISOString(),
        answerable_at: new Date(server + 1500).toISOString(),
        ends_at: new Date(server + 21_500).toISOString(),
        you_can_answer: true,
      }
      render(Room, { code: 'ABYSSAL', navigate: () => {} })
      applyServerMessage({
        ...welcome(roomView({ phase: 'open', next_at: null, total: 11 })),
        question: held,
        server_time: new Date(server).toISOString(),
      })
      await tick()
      expect(screen.getByRole('heading', { name: 'Evil Bob' })).toBeTruthy()
      expect(screen.getByText('What amulet lets you talk to cats?')).toBeTruthy()
      expect(screen.queryByRole('button', { name: 'Catspeak' })).toBeNull()
      // The settled stage: no entrance replayed, no prompt typed again.
      expect(document.querySelector('.stage-row')?.classList.contains('entering')).toBe(false)
      // The bar under the top bar counts the question's twenty seconds, not the hold.
      expect(get(timerBar)?.totalSeconds).toBe(20)

      await vi.advanceTimersByTimeAsync(1490)
      await tick()
      expect(screen.queryByRole('button', { name: 'Catspeak' })).toBeNull()
      await vi.advanceTimersByTimeAsync(20)
      await tick()
      screen.getByRole('button', { name: 'Catspeak' }).click()
      expect(sent).toContainEqual({ t: 'answer', question_id: 'q_bob', value: 0 })
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps the room around a question whose view throws', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    TYPE_VIEWS.throws = (() => {
      throw new Error('a payload this build misreads')
    }) as unknown as Component<TypeViewProps>
    try {
      const open: OpenQuestion = {
        question_id: 'q1',
        index: 0,
        total: 2,
        type: 'throws',
        mode: 'more_less',
        segment: { ...SEGMENT, count: 2 },
        view: {},
        opened_at: new Date().toISOString(),
        ends_at: new Date(Date.now() + 10_000).toISOString(),
        you_can_answer: true,
      }
      await arrive(welcome(roomView({ phase: 'open', next_at: null })))
      applyServerMessage({ t: 'question_open', question: open })
      await screen.findByText(/Question 1 of 2/)
      const fallback = "This question can't be shown in this version. Refresh to update."
      expect(screen.getByText(fallback)).toBeTruthy()

      applyServerMessage({
        t: 'question_closed',
        question_id: 'q1',
        reveal: {},
        results: { b: { value: 0, correct: true, credit: 1, points: 900 } },
        standings: STANDINGS,
        next_at: new Date(Date.now() + 8_000).toISOString(),
        reveal_seconds: 8,
      })
      await screen.findByText('1 of 1')
      expect(screen.getByText(fallback)).toBeTruthy()
      expect(screen.getByText(/Question 1 of 2/)).toBeTruthy()
    } finally {
      delete TYPE_VIEWS.throws
      logged.mockRestore()
    }
  })

  it('drops a count for a question that is no longer open', async () => {
    await arrive(welcome(roomView({ phase: 'reveal', next_at: null })))
    applyServerMessage({ t: 'answer_count', question_id: 'gone', answered: 3, of: 4 })
    expect(document.querySelector('.waiting')).toBeNull()
  })

  it('falls through to the waiting screen on a phase it does not know', async () => {
    const unknown = roomView({ phase: 'intermission' as RoomView['phase'], next_at: null })
    await arrive(welcome(unknown))
    expect(screen.getByText('Waiting for the next question…')).toBeTruthy()
    expect(document.querySelector('.hiscores')).toBeNull()
  })

  it('goes straight to the final hiscores for a client arriving after the end', async () => {
    await arrive(welcome(roomView({ status: 'finished', phase: 'idle', next_at: null, segment: null })))
    const heading = screen.getByRole('heading', { level: 1 })
    expect(heading.textContent).toBe('Final standings')
    expect(screen.getByText('Gz, Zezima! Here are the full hiscores.')).toBeTruthy()
    expect(document.querySelectorAll('.hiscores tbody tr')).toHaveLength(2)
    expect(screen.queryByRole('button', { name: 'Skip to the hiscores' })).toBeNull()
  })

  it('presents the top five first to a client that watched the game end', async () => {
    await arrive(welcome(roomView({ phase: 'reveal' })))
    applyServerMessage({
      t: 'room_updated',
      room: roomView({ status: 'finished', phase: 'idle', next_at: null, segment: null }),
      players: [],
    })
    applyServerMessage({ t: 'game_finished', standings: STANDINGS })
    await screen.findByRole('button', { name: 'Skip to the hiscores' })
    expect(document.querySelector('.hiscores')).toBeNull()
  })
})

describe('the room’s own headings', () => {
  const titles = () =>
    screen.queryAllByRole('heading', { level: 1 }).map((heading) => heading.textContent ?? '')

  it('never name the room by its code, which the lobby shows and the bar does not', async () => {
    render(Room, { code: 'ABYSSAL', navigate: () => {} })
    expect(screen.getByText('Connecting…')).toBeTruthy()
    expect(titles()).toEqual([])
    applyServerMessage(
      welcome(roomView({ status: 'lobby', phase: 'idle', next_at: null, segment: null })),
    )
    await screen.findByRole('heading', { level: 1, name: 'Lobby' })
    expect(titles()).toEqual(['Lobby'])
    closeSocket('no_room', '')
    await screen.findByRole('heading', { level: 1, name: 'Disconnected' })
    expect(titles()).toEqual(['Disconnected'])
  })

  it('sit on panels or the scroll, as does the line while it connects', async () => {
    const onPanel = (element: Element) => element.closest('.panel, .paper') !== null
    render(Room, { code: 'ABYSSAL', navigate: () => {} })
    expect(onPanel(screen.getByText('Connecting…'))).toBe(true)
    applyServerMessage(
      welcome(roomView({ status: 'lobby', phase: 'idle', next_at: null, segment: null })),
    )
    expect(onPanel(await screen.findByRole('heading', { level: 1, name: 'Lobby' }))).toBe(true)
    closeSocket('no_room', '')
    expect(onPanel(await screen.findByRole('heading', { level: 1, name: 'Disconnected' }))).toBe(
      true,
    )
  })
})

describe('a room that is gone', () => {
  const FINAL = [{ player_id: 'a', display_name: 'Zezima', points: 900, rank: 1, points_gained: 900, previous_rank: null }]

  beforeEach(() => {
    resetRoom()
    localStorage.clear()
  })

  it('opens the result this browser kept, when it kept one', () => {
    savePastGame({
      code: 'ABYSSAL',
      finishedAt: '2026-10-01T20:05:00Z',
      standings: FINAL,
      youId: 'a',
    })
    const navigate = vi.fn()
    render(Room, { code: 'ABYSSAL', navigate })
    closeSocket('no_room', '')
    expect(navigate).toHaveBeenCalledWith('/history/ABYSSAL/2610012005')
  })

  it('says the room is gone, when it kept none', async () => {
    const navigate = vi.fn()
    render(Room, { code: 'ABYSSAL', navigate })
    closeSocket('no_room', '')
    await screen.findByText(/That room is gone/)
    expect(navigate).not.toHaveBeenCalled()
  })
})

describe('the list a question is answered from', () => {
  const EXAMINE = { prompt: 'A very powerful onyx amulet.', vocab: 'examines' }
  let fetched: string[]

  beforeEach(() => {
    // The last test's question is still in the stores, and a first render would draw it.
    resetRoom()
    fetched = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        fetched.push(url)
        return new Response(JSON.stringify({ vocab: 'examines', version: 'v1', entries: [] }))
      }),
    )
  })

  afterEach(() => {
    clearVocabCache()
    vi.unstubAllGlobals()
  })

  function opened(patch: Partial<OpenQuestion>): OpenQuestion {
    return {
      question_id: 'q1',
      index: 0,
      total: 2,
      type: 'pick_from_list',
      mode: 'guess_examine',
      segment: { ...SEGMENT, mode: 'guess_examine', count: 2 },
      view: EXAMINE,
      opened_at: new Date().toISOString(),
      ends_at: new Date(Date.now() + 20_000).toISOString(),
      you_can_answer: true,
      ...patch,
    }
  }

  it('is fetched as a round’s question opens, by the name its view gives', async () => {
    await arrive(welcome(roomView({ phase: 'open', next_at: null })))
    applyServerMessage({ t: 'question_open', question: opened({}) })
    await tick()
    expect(fetched).toEqual(['/api/vocab/examines'])
  })

  it('is fetched while an NPC holds the floor, before the answers are up', async () => {
    const event = opened({
      mode: 'random_event',
      segment: SEGMENT,
      random_event: 'bob',
      answerable_at: new Date(Date.now() + 60_000).toISOString(),
      ends_at: new Date(Date.now() + 80_000).toISOString(),
    })
    render(Room, { code: 'ABYSSAL', navigate: () => {} })
    applyServerMessage({ ...welcome(roomView({ phase: 'open', next_at: null })), question: event })
    await screen.findByRole('heading', { name: 'Evil Bob' })
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(fetched).toEqual(['/api/vocab/examines'])
  })

  it('is not fetched for a question answered any other way', async () => {
    await arrive(welcome(roomView({ phase: 'open', next_at: null })))
    applyServerMessage({
      t: 'question_open',
      question: opened({
        type: 'multiple_choice',
        mode: 'random_event',
        segment: SEGMENT,
        random_event: 'bob',
        view: { prompt: 'What amulet lets you talk to cats?', options: ['Catspeak', 'Camulet'] },
      }),
    })
    await tick()
    applyServerMessage({
      t: 'question_open',
      question: opened({
        question_id: 'q2',
        index: 1,
        type: 'more_less',
        mode: 'more_less',
        segment: { ...SEGMENT, count: 2 },
        view: {
          metric: 'ge_price',
          direction: 'more',
          options: [{ subject: { name: 'Abyssal whip' } }, { subject: { name: 'Dragon bones' } }],
          as_of: '2026-09-01',
        },
      }),
    })
    await screen.findByText('Abyssal whip')
    expect(fetched).toEqual([])
  })
})

describe('a random event’s way out', () => {
  const PROMPT = 'What amulet lets you talk to cats?'

  function bob(patch: Partial<OpenQuestion> = {}): OpenQuestion {
    return {
      question_id: 'q_bob',
      index: 0,
      total: 2,
      type: 'multiple_choice',
      mode: 'random_event',
      segment: { ...SEGMENT, count: 2 },
      view: { prompt: PROMPT, options: ['Catspeak', 'Camulet'] },
      random_event: 'bob',
      opened_at: new Date().toISOString(),
      answerable_at: new Date().toISOString(),
      ends_at: new Date(Date.now() + 10_000).toISOString(),
      you_can_answer: true,
      ...patch,
    }
  }

  function close(nextAt: number): void {
    applyServerMessage({
      t: 'question_closed',
      question_id: 'q_bob',
      reveal: { prompt: PROMPT, options: ['Catspeak', 'Camulet'], answer_index: 0 },
      results: {},
      standings: STANDINGS,
      next_at: new Date(nextAt).toISOString(),
      reveal_seconds: 8,
    })
  }

  const WHIP = {
    question_id: 'q2',
    index: 1,
    total: 2,
    type: 'more_less',
    mode: 'more_less',
    segment: { ...SEGMENT, count: 2 },
    view: {
      metric: 'ge_price',
      direction: 'more',
      options: [{ subject: { name: 'Abyssal whip' } }, { subject: { name: 'Dragon bones' } }],
      as_of: '2026-09-01',
    },
    opened_at: new Date().toISOString(),
    ends_at: new Date(Date.now() + 10_000).toISOString(),
    you_can_answer: true,
  } satisfies OpenQuestion

  beforeEach(() => {
    resetRoom()
  })

  it('hands the stage back to the host before the standings', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    try {
      await arrive(welcome(roomView({ phase: 'open', next_at: null })))
      applyServerMessage({ t: 'question_open', question: bob() })
      await tick()
      close(Date.now() + 8000)
      await tick()
      const row = document.querySelector('.stage-row')!
      expect(row.classList.contains('returning')).toBe(false)
      await vi.advanceTimersByTimeAsync(8000 - RETURN_MS - 10)
      await tick()
      expect(row.classList.contains('returning')).toBe(false)
      await vi.advanceTimersByTimeAsync(20)
      await tick()
      expect(row.classList.contains('returning')).toBe(true)
      await vi.advanceTimersByTimeAsync(RETURN_MS - 10)
      applyServerMessage({
        t: 'room_updated',
        room: roomView({ phase: 'standings', current_index: 0 }),
        players: [],
      })
      await tick()
      expect(document.querySelector('.hiscores')).not.toBeNull()
      expect(document.querySelector('.stage-row:is(.event, .returning)')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  describe('when the host skips it', () => {
    let restore = () => {}

    beforeEach(() => {
      restore = stubAnimations()
    })

    afterEach(() => {
      vi.useRealTimers()
      restore()
    })

    const row = () => document.querySelector('.stage-row')!

    it('walks the event NPC off, then the host back on, before the next question', async () => {
      await arrive(welcome(roomView({ phase: 'open', next_at: null })))
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
      applyServerMessage({ t: 'question_open', question: bob() })
      await tick()
      close(Date.now() + 8000)
      await tick()
      applyServerMessage({ t: 'question_open', question: { ...WHIP, answerable_at: inSeconds(3) } })
      await tick()
      expect(row().classList.contains('presence-leaving')).toBe(true)
      await vi.advanceTimersByTimeAsync(HOST_OUT_MS + MOVE_MS)
      expect(row().classList.contains('presence-arriving')).toBe(true)
      await vi.advanceTimersByTimeAsync(HOST_IN_MS)
      expect(row().classList.contains('presence-here')).toBe(true)
      expect(document.querySelector('.stage-ghost')).toBeNull()
      expect(screen.getByText('Abyssal whip')).toBeTruthy()
      expect(screen.queryByRole('heading', { name: 'Evil Bob' })).toBeNull()
    })

    it('only moves the scroll once the return has played: the host is already back', async () => {
      await arrive(welcome(roomView({ phase: 'open', next_at: null })))
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
      applyServerMessage({ t: 'question_open', question: bob() })
      await tick()
      close(Date.now() - 1)
      await tick()
      applyServerMessage({ t: 'question_open', question: { ...WHIP, answerable_at: inSeconds(3) } })
      await tick()
      expect(row().classList.contains('presence-here')).toBe(true)
      expect(document.querySelector('.stage-ghost')).not.toBeNull()
      await vi.advanceTimersByTimeAsync(WORDS_OUT_MS + MOVE_MS)
      expect(row().classList.contains('presence-here')).toBe(true)
      expect(document.querySelector('.stage-ghost')).toBeNull()
    })
  })
})

describe('the shared stage', () => {
  const ASKED: OpenQuestion = {
    question_id: 'q1',
    index: 0,
    total: 2,
    type: 'more_less',
    mode: 'more_less',
    segment: { ...SEGMENT, count: 2 },
    view: {
      metric: 'ge_price',
      direction: 'more',
      options: [{ subject: { name: 'Abyssal whip' } }, { subject: { name: 'Dragon bones' } }],
      as_of: '2026-09-01',
    },
    opened_at: new Date().toISOString(),
    ends_at: new Date(Date.now() + 10_000).toISOString(),
    you_can_answer: true,
  }

  let restore = () => {}

  beforeEach(() => {
    resetRoom()
    restore = stubAnimations()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    restore()
  })

  /** Arrives on the round's splash, then lets the clock be faked. */
  async function onSplash(): Promise<void> {
    render(Room, { code: 'ABYSSAL', navigate: () => {} })
    applyServerMessage(welcome(roomView({ phase: 'splash', next_at: null })))
    await screen.findByRole('heading', { level: 2, name: MODES.more_less!.label })
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
  }

  function ask(): void {
    applyServerMessage({
      t: 'question_open',
      question: { ...ASKED, opened_at: new Date().toISOString(), answerable_at: inSeconds(3) },
    })
  }

  const words = () => document.querySelector<HTMLElement>('.stage .content')!
  const under = () => document.querySelector<HTMLElement>('.stage .under')!
  const row = () => document.querySelector('.stage-row')!

  it('keeps one scroll from the splash into the question, whose words wait for it', async () => {
    await onSplash()
    const scroll = document.querySelector('.scroll')
    ask()
    await tick()
    expect(document.querySelectorAll('.scroll')).toHaveLength(1)
    expect(document.querySelector('.scroll')).toBe(scroll)
    expect(document.querySelector('.stage-ghost')?.textContent).toContain(MODES.more_less!.label)
    expect(words().style.opacity).toBe('0')
    expect(words().textContent).toContain('Which costs more')
    expect(under().textContent).toContain('Abyssal whip')
    // The same host keeps standing: only the words go and come.
    expect(row().classList.contains('presence-here')).toBe(true)
    await vi.advanceTimersByTimeAsync(WORDS_OUT_MS)
    expect(document.querySelector('.stage-ghost')).toBeNull()
    expect(words().style.opacity).toBe('0')
    await vi.advanceTimersByTimeAsync(MOVE_MS)
    expect(words().style.opacity).toBe('')
    expect(row().classList.contains('presence-here')).toBe(true)
  })

  it('swaps the host for the Wise Old Man at the standings, before his words', async () => {
    await onSplash()
    ask()
    await vi.advanceTimersByTimeAsync(1000)
    applyServerMessage({
      t: 'question_closed',
      question_id: 'q1',
      reveal: { values: [100, 50], answer_index: 0 },
      results: {},
      standings: STANDINGS,
      next_at: inSeconds(5),
      reveal_seconds: 5,
    })
    await tick()
    applyServerMessage({
      t: 'room_updated',
      room: roomView({ phase: 'standings', current_index: 0 }),
      players: [],
    })
    await tick()
    const host = () => document.querySelector<HTMLImageElement>('.stage-row .npc.host img')!
    expect(row().classList.contains('presence-leaving')).toBe(true)
    expect(words().style.opacity).toBe('0')
    await vi.advanceTimersByTimeAsync(HOST_OUT_MS)
    expect(row().classList.contains('presence-away')).toBe(true)
    expect(host().getAttribute('src')).toBe(npcArt(HISCORES_HOST).url)
    await vi.advanceTimersByTimeAsync(MOVE_MS)
    expect(row().classList.contains('presence-arriving')).toBe(true)
    expect(words().style.opacity).toBe('0')
    await vi.advanceTimersByTimeAsync(HOST_IN_MS)
    expect(row().classList.contains('presence-here')).toBe(true)
    expect(words().style.opacity).toBe('')
    expect(document.querySelector('.hiscores')).not.toBeNull()
  })

  it('finishes a hand-over at once when the page comes back into view', async () => {
    await onSplash()
    ask()
    await tick()
    expect(words().style.opacity).toBe('0')
    document.dispatchEvent(new Event('visibilitychange'))
    await tick()
    expect(document.querySelector('.stage-ghost')).toBeNull()
    expect(words().style.opacity).toBe('')
    expect(words().textContent).toContain('Which costs more')
    expect(row().classList.contains('presence-here')).toBe(true)
  })

  it('slides the scroll in from where it stood as the lobby’s wider stage narrows', async () => {
    // The lobby's hero widens the stage, which stays centred; laid out as a browser would.
    const boxes = {
      lobby: { stage: [169, 672], scroll: [369, 472, 313] },
      round: { stage: [272, 480], scroll: [320, 432, 227] },
    }
    let layout = boxes.lobby
    const box = (left: number, width: number, height = 100) =>
      ({ left, top: 88, width, height, right: left + width, bottom: 88 + height, x: left, y: 88 }) as DOMRect
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const at = layout
      if (this.classList.contains('stage')) return box(at.stage[0]!, at.stage[1]!)
      if (this.classList.contains('scroll')) return box(at.scroll[0]!, at.scroll[1]!, at.scroll[2])
      return box(0, 0)
    })
    const moves: Keyframe[][] = []
    const animate = Element.prototype.animate
    Element.prototype.animate = function (this: Element, keyframes, options) {
      if (this.classList.contains('scroll')) moves.push(keyframes as Keyframe[])
      return animate.call(this, keyframes, options)
    }
    try {
      render(Room, { code: 'ABYSSAL', navigate: () => {} })
      applyServerMessage(
        welcome(roomView({ status: 'lobby', phase: 'idle', next_at: null, segment: null })),
      )
      await screen.findByRole('heading', { level: 1, name: 'Lobby' })
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
      applyServerMessage({
        t: 'room_updated',
        room: roomView({ phase: 'splash', next_at: null }),
        players: [],
      })
      await tick()
      layout = boxes.round
      await vi.advanceTimersByTimeAsync(HOST_OUT_MS)
      // 136px left of the centre in the lobby, 192px in the round: it starts 56px right.
      expect(moves[0]?.[0]?.transform).toBe('translate(56px, 0px)')
    } finally {
      Element.prototype.animate = animate
      vi.restoreAllMocks()
    }
  })

  it('cuts on a hidden page, whose clock would leave the words waiting', async () => {
    await onSplash()
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    try {
      ask()
      await tick()
      expect(document.querySelector('.stage-ghost')).toBeNull()
      expect(words().style.opacity).toBe('')
    } finally {
      vi.restoreAllMocks()
    }
  })

  it('cuts straight to the next screen under reduced motion', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('reduce'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }))
    await onSplash()
    ask()
    await tick()
    expect(document.querySelector('.stage-ghost')).toBeNull()
    expect(words().style.opacity).toBe('')
    expect(words().textContent).toContain('Which costs more')
  })
})

describe('the host’s skip', () => {
  /** Two rounds of two: positions 1 and 3 end a round, and 3 ends the game. */
  function reveal(index: number, standingsSeconds = 10): RoomView {
    const view = roomView({
      phase: 'reveal',
      current_index: index,
      total: 4,
      segment: { mode: 'more_less', index: index < 2 ? 0 : 1, total: 2, start: index < 2 ? 0 : 2, count: 2 },
    })
    view.settings.standings_seconds = standingsSeconds
    return view
  }

  it.each([
    ['inside a round', reveal(0), 'Skip to the next question'],
    ['after a round, before the standings', reveal(1), 'Show the standings now'],
    ['after a round, with the standings off', reveal(1, 0), 'Start the next round now'],
    ['after the game’s last question', reveal(3), 'Show the final standings'],
  ])('says where a reveal %s goes, and names it when pressed', async (_, view, label) => {
    await arrive(welcome(view, 'admin'))
    screen.getByRole('button', { name: label }).click()
    expect(sent).toEqual([{ t: 'skip', phase: 'reveal', index: view.current_index }])
  })

  it('names the question it closes', async () => {
    await arrive(welcome(roomView({ phase: 'open', current_index: 1, next_at: null }), 'admin'))
    screen.getByRole('button', { name: 'Close this question now' }).click()
    expect(sent).toEqual([{ t: 'skip', phase: 'open', index: 1 }])
  })

  it('names the splash it cuts short', async () => {
    // The splash is the whole screen, with no heading for `arrive` to wait on.
    render(Room, { code: 'ABYSSAL', navigate: () => {} })
    applyServerMessage(welcome(roomView({ phase: 'splash', next_at: null }), 'admin'))
    ;(await screen.findByRole('button', { name: 'Start the round now' })).click()
    expect(sent).toEqual([{ t: 'skip', phase: 'splash', index: 0 }])
  })
})

describe('the host’s End the game', () => {
  async function ask(): Promise<HTMLElement> {
    await arrive(welcome(roomView({ phase: 'reveal' }), 'admin'))
    await fireEvent.click(screen.getByRole('button', { name: 'End the game' }))
    const dialog = screen.getByRole('dialog')
    expect(dialog.textContent).toContain('End the game now and show the final standings?')
    return dialog
  }

  it('ends the game only once the host confirms', async () => {
    const dialog = await ask()
    expect(sent).toEqual([])
    await fireEvent.click(within(dialog).getByRole('button', { name: 'End the game' }))
    expect(sent).toEqual([{ t: 'end_game' }])
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('sends nothing when cancelled', async () => {
    await fireEvent.click(within(await ask()).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(sent).toEqual([])
  })
})

describe('what a screen reader and the tab hear', () => {
  const WHIP: OpenQuestion = {
    question_id: 'q1',
    index: 0,
    total: 2,
    type: 'more_less',
    mode: 'more_less',
    segment: { ...SEGMENT, count: 2 },
    view: {
      metric: 'ge_price',
      direction: 'more',
      options: [{ subject: { name: 'Abyssal whip' } }, { subject: { name: 'Dragon bones' } }],
      as_of: '2026-09-01',
    },
    opened_at: new Date().toISOString(),
    ends_at: new Date(Date.now() + 10_000).toISOString(),
    you_can_answer: true,
  }

  let container: HTMLElement

  beforeEach(() => {
    resetRoom()
    document.title = 'Jolly Boar Inn'
    container = render(Room, { code: 'ABYSSAL', navigate: () => {} }).container
  })

  /** The one live region Room keeps mounted, as opposed to a component's own. */
  const live = () => container.querySelector(':scope > [aria-live="polite"]')

  it('announces a question as it opens, and puts focus on its heading', async () => {
    applyServerMessage(welcome(roomView({ phase: 'reveal', next_at: null })))
    const region = live()
    expect(region).not.toBeNull()
    applyServerMessage({ t: 'question_open', question: WHIP })
    await waitFor(() => expect(live()?.textContent).toBe('Round 1 of 2, question 1 of 2'))
    const heading = screen.getByRole('heading', { level: 1 })
    expect(heading.textContent).toMatch(/Question 1 of 2/)
    expect(document.activeElement).toBe(heading)
    expect(live()).toBe(region)
  })

  it('says who interrupts as a random event opens, and not again on a reconnect', async () => {
    applyServerMessage(welcome(roomView({ phase: 'reveal', next_at: null })))
    const bob: OpenQuestion = {
      ...WHIP,
      question_id: 'q_bob',
      type: 'multiple_choice',
      mode: 'random_event',
      view: { prompt: 'What amulet lets you talk to cats?', options: ['Catspeak', 'Camulet'] },
      random_event: 'bob',
    }
    applyServerMessage({ t: 'question_open', question: bob })
    await waitFor(() =>
      expect(live()?.textContent).toBe('Random event: Evil Bob interrupts the round.'),
    )
    applyServerMessage({
      ...welcome(roomView({ phase: 'open', next_at: null })),
      question: { ...bob, question_id: 'q_bob_again' },
    })
    await waitFor(() => expect(live()?.textContent).toBe('Round 1 of 2, question 1 of 2'))
  })

  it('says a round of its own without the round', async () => {
    applyServerMessage(welcome(roomView({ phase: 'open', next_at: null })))
    const alone = { ...SEGMENT, total: 1, count: 10 }
    applyServerMessage({
      t: 'question_open',
      question: { ...WHIP, index: 2, total: 10, segment: alone },
    })
    await waitFor(() => expect(live()?.textContent).toBe('Question 3 of 10'))
    expect(document.title).toBe('Question 3 of 10 · Jolly Boar Inn')
  })

  it('leaves focus where someone is typing', async () => {
    const field = document.createElement('input')
    document.body.append(field)
    try {
      field.focus()
      applyServerMessage(welcome(roomView({ phase: 'open', next_at: null })))
      applyServerMessage({ t: 'question_open', question: WHIP })
      await waitFor(() => expect(live()?.textContent).not.toBe(''))
      await tick()
      expect(document.activeElement).toBe(field)
    } finally {
      field.remove()
    }
  })

  it('announces the verdict in the same region, with the running total', async () => {
    applyServerMessage(welcome(roomView({ phase: 'open', next_at: null })))
    applyServerMessage({ t: 'question_open', question: WHIP })
    await waitFor(() => expect(live()?.textContent).not.toBe(''))
    const region = live()
    applyServerMessage({
      t: 'question_closed',
      question_id: 'q1',
      reveal: { ...WHIP.view, answer_index: 0 },
      results: { a: { value: 0, correct: true, credit: 1, points: 850 } },
      standings: [{ ...STANDINGS[0]!, points: 1850 }, STANDINGS[1]!],
      next_at: new Date(Date.now() + 8_000).toISOString(),
      reveal_seconds: 8,
    })
    await waitFor(() => expect(live()?.textContent).toBe('Right, +850 points. 1,850 in total.'))
    expect(live()).toBe(region)
    // The slot itself is no live region: one inserted already filled often goes unread.
    expect(document.querySelector('.slot')?.getAttribute('role')).toBeNull()
  })

  it('announces a lost connection, and the banner is a status', async () => {
    applyServerMessage(welcome(roomView({ phase: 'open', next_at: null })))
    connection.set('reconnecting')
    await waitFor(() => expect(live()?.textContent).toBe('Connection lost'))
    expect(screen.getByRole('status').textContent).toBe('Connection lost — reconnecting…')
  })

  it.each([
    ['the lobby', roomView({ status: 'lobby', phase: 'idle', next_at: null, segment: null }), 'Lobby'],
    ['a splash', roomView({ phase: 'splash', next_at: null }), 'Round 1 of 2'],
    ['the standings', roomView({}), 'Standings'],
    ['the final screen', roomView({ status: 'finished', phase: 'idle', next_at: null }), 'Final standings'],
  ])('names %s in the tab title', async (_, view, title) => {
    applyServerMessage(welcome(view))
    await waitFor(() => expect(document.title).toBe(`${title} · Jolly Boar Inn`))
  })

  it('gives the tab its own title back on the way out', async () => {
    applyServerMessage(welcome(roomView({})))
    await waitFor(() => expect(document.title).toBe('Standings · Jolly Boar Inn'))
    cleanup()
    expect(document.title).toBe('Jolly Boar Inn')
  })
})
