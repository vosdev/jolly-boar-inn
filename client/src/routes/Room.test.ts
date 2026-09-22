/**
 * D9: the room screen in and around the `standings` phase, fed frames straight through
 * `applyServerMessage` with the socket mocked out.
 *
 * Between rounds the podium is the screen, under a timer to the next round. Inside a
 * round there is no board under the reveal. And a phase this build does not know falls
 * through to the waiting screen, which is what a build from before `standings` does
 * with that phase.
 */

import { render, screen } from '@testing-library/svelte'
import { tick } from 'svelte'
import { get } from 'svelte/store'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { OpenQuestion, RoomView, Standing, Welcome } from '../lib/protocol'
import { applyServerMessage } from '../lib/stores'
import { timerBar } from '../lib/timerbar'
import Room from './Room.svelte'

vi.mock('../lib/session', async (importOriginal) => {
  const real = await importOriginal<typeof import('../lib/session')>()
  return { ...real, getSession: () => 'session' }
})

const sent: unknown[] = []

vi.mock('../lib/ws', () => ({
  RoomSocket: class {
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
        { mode: 'more_less', questions: 1, seconds: 10 },
        { mode: 'price_is_right', questions: 1, seconds: 10 },
      ],
      mode_order: 'listed',
      random_event_frequency: 'default',
      reveal_seconds: 8,
      splash_seconds: 0,
      random_event_seconds: 2,
      standings_seconds: 10,
      close_when_all_answered: true,
      max_players: 50,
    },
    current_index: 0,
    total: 2,
    phase: 'standings',
    next_at: new Date(Date.now() + 10_000).toISOString(),
    segment: SEGMENT,
    ...patch,
  }
}

const STANDINGS: Standing[] = [
  { player_id: 'a', display_name: 'Zezima', avatar: null, points: 1000, rank: 1 },
  { player_id: 'b', display_name: 'Woox', avatar: null, points: 0, rank: 2 },
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
  }
}

beforeEach(() => {
  sent.length = 0
})

async function arrive(message: Welcome): Promise<void> {
  render(Room, { code: 'ABYSSAL', navigate: () => {} })
  applyServerMessage(message)
  await screen.findByRole('heading', { level: 1 })
}

describe('Room', () => {
  it('shows the podium between rounds, with a timer to the next round', async () => {
    await arrive(welcome(roomView({})))
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(
      /After round 1 of 2\s*Standings/,
    )
    // The countdown is the bar under the top bar (D8), which App draws from this store.
    expect(get(timerBar)?.label).toBe('to the next round')
    expect(document.querySelector('.podium')).not.toBeNull()
    expect(screen.getByText('1st, Diamond trophy: Zezima, 1,000 points')).toBeTruthy()
  })

  it('lets the host start the next round early', async () => {
    await arrive(welcome(roomView({}), 'admin'))
    screen.getByRole('button', { name: 'Start the next round now' }).click()
    expect(sent).toContainEqual({ t: 'skip' })
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
    })
    await screen.findByText(/Question 1 of 2/)
    expect(document.querySelector('.podium')).toBeNull()
    expect(document.querySelector('.hiscores')).toBeNull()
  })

  it('puts the points slot on the reveal, with the total the standings will show', async () => {
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
      standings: [{ ...STANDINGS[0], points: 1850 }, STANDINGS[1]],
      next_at: new Date(Date.now() + 8_000).toISOString(),
    })
    await screen.findByText('1,850')
    expect(document.querySelector('.slot .earned')?.textContent?.trim()).toBe('✓+850')
    expect(get(timerBar)?.label).toBe('to the next question')
  })

  it('lands a reconnect inside an NPC’s hold on the card, with what is left of it', async () => {
    // T22 Accept: rebuilt from the welcome alone. The server's clock is a minute ahead of
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
      expect(screen.getByRole('heading', { name: 'Bob' })).toBeTruthy()
      expect(screen.getByText('What amulet lets you talk to cats?')).toBeTruthy()
      expect(screen.queryByRole('button', { name: 'Catspeak' })).toBeNull()
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

  it('drops a count for a question that is no longer open', async () => {
    await arrive(welcome(roomView({ phase: 'reveal', next_at: null })))
    applyServerMessage({ t: 'answer_count', question_id: 'gone', answered: 3, of: 4 })
    expect(document.querySelector('.waiting')).toBeNull()
  })

  it('falls through to the waiting screen on a phase it does not know', async () => {
    const unknown = roomView({ phase: 'intermission' as RoomView['phase'], next_at: null })
    await arrive(welcome(unknown))
    expect(screen.getByText('Waiting for the next question…')).toBeTruthy()
    expect(document.querySelector('.podium')).toBeNull()
  })

  it('draws the same podium on the final screen, with everyone in the table', async () => {
    await arrive(welcome(roomView({ status: 'finished', phase: 'idle', next_at: null, segment: null })))
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Final standings')
    expect(document.querySelector('.podium')).not.toBeNull()
    expect(document.querySelectorAll('.hiscores tbody tr')).toHaveLength(2)
  })
})
