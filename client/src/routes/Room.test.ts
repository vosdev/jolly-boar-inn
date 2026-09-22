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
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { OpenQuestion, RoomView, Standing, Welcome } from '../lib/protocol'
import { applyServerMessage } from '../lib/stores'
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
      random_events: false,
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
    expect(screen.getByText('s to the next round')).toBeTruthy()
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
