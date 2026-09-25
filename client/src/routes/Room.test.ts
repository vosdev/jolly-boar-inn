/**
 * D9: the room screen in and around the `standings` phase, fed frames straight through
 * `applyServerMessage` with the socket mocked out.
 *
 * Between rounds the podium is the screen, under a timer to the next round. Inside a
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
import { applyServerMessage, connection, resetRoom } from '../lib/stores'
import { timerBar } from '../lib/timerbar'
import { clearVocabCache } from '../lib/vocab'
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
    server_version: __APP_VERSION__,
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
      standings: [{ ...STANDINGS[0]!, points: 1850 }, STANDINGS[1]!],
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
    expect(document.querySelector('.podium')).toBeNull()
  })

  it('draws the same podium on the final screen, with everyone in the table', async () => {
    await arrive(welcome(roomView({ status: 'finished', phase: 'idle', next_at: null, segment: null })))
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Final standings')
    expect(document.querySelector('.podium')).not.toBeNull()
    expect(document.querySelectorAll('.hiscores tbody tr')).toHaveLength(2)
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
    await screen.findByRole('heading', { name: 'Bob' })
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
