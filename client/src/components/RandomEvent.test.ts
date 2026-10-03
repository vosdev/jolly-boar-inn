/**
 * The card: the NPC, their line and their question, with the answers held back until
 * `answerable_at` on the server's clock -- and an NPC this build has never heard of drawn
 * as the Mysterious Old Man, quietly.
 *
 * The clock is faked so the hold is counted, not waited out. `serverOffsetMs` is set the
 * way a `welcome` sets it, so a test can put this browser's clock a minute out and check
 * the card still waits exactly as long as the server said.
 */

import { render, screen } from '@testing-library/svelte'
import { tick } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { OpenQuestion } from '../lib/protocol'
import { RANDOM_EVENTS } from '../lib/randomEvents'
import { serverOffsetMs } from '../lib/stores'
import RandomEvent from './RandomEvent.svelte'

const NOW = Date.parse('2026-09-22T20:00:00Z')

function event(patch: Partial<OpenQuestion> = {}): OpenQuestion {
  return {
    question_id: 'q_death',
    index: 4,
    total: 11,
    type: 'multiple_choice',
    mode: 'random_event',
    segment: { mode: 'more_less', index: 0, total: 1, start: 0, count: 11 },
    view: { prompt: 'Which prayer level unlocks Augury?', options: ['70', '77', '74'] },
    random_event: 'death',
    opened_at: new Date(NOW).toISOString(),
    answerable_at: new Date(NOW + 2000).toISOString(),
    ends_at: new Date(NOW + 22_000).toISOString(),
    you_can_answer: true,
    ...patch,
  }
}

const buttons = () => screen.queryAllByRole('button')

async function after(ms: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms)
  await tick()
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
  vi.setSystemTime(NOW)
  serverOffsetMs.set(0)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('RandomEvent', () => {
  it('draws the NPC, their line and the question, and holds the answers back', async () => {
    render(RandomEvent, { question: event(), yourValue: null, onAnswer: () => {} })
    const death = RANDOM_EVENTS.find((npc) => npc.id === 'death')!
    expect(screen.getByRole('heading', { name: 'Death' })).toBeTruthy()
    expect(screen.getByText(death.line)).toBeTruthy()
    expect(screen.getByText('Which prayer level unlocks Augury?')).toBeTruthy()
    expect(buttons()).toHaveLength(0)
    expect(screen.getByRole('status').textContent).toBe('The answers appear in a moment.')

    await after(1990)
    expect(buttons()).toHaveLength(0)
    await after(20)
    expect(buttons().map((b) => b.textContent?.trim())).toEqual(['70', '77', '74'])
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('counts the hold on the server clock, not this browser’s', async () => {
    // A reconnect a second into the hold, on a laptop whose clock is a minute slow: the
    // welcome says the server is a minute ahead, and one second of hold is what is left.
    serverOffsetMs.set(60_000)
    vi.setSystemTime(NOW - 60_000 + 1000)
    render(RandomEvent, { question: event(), yourValue: null, onAnswer: () => {} })
    expect(buttons()).toHaveLength(0)
    await after(990)
    expect(buttons()).toHaveLength(0)
    await after(20)
    expect(buttons()).toHaveLength(3)
  })

  it('keeps to the hold when a pong moves the offset in the middle of it', async () => {
    // Every pong re-reads the server clock, and the card re-arms its wake-up on it. The
    // second already waited must not be waited again.
    render(RandomEvent, { question: event(), yourValue: null, onAnswer: () => {} })
    await after(1000)
    serverOffsetMs.set(3)
    await after(990)
    expect(buttons()).toHaveLength(0)
    await after(20)
    expect(buttons()).toHaveLength(3)
  })

  it('offers the answers at once when there is no hold', () => {
    // A question the server opened with no hold, and one from before `answerable_at` existed.
    render(RandomEvent, {
      question: event({ answerable_at: new Date(NOW).toISOString() }),
      yourValue: null,
      onAnswer: () => {},
    })
    expect(buttons()).toHaveLength(3)
    const old = event()
    delete old.answerable_at
    render(RandomEvent, { question: old, yourValue: null, onAnswer: () => {} })
    expect(buttons()).toHaveLength(6)
  })

  it('keeps the NPC on the reveal, with nothing held', () => {
    render(RandomEvent, {
      question: event(),
      reveal: { prompt: 'Which prayer level unlocks Augury?', options: ['70', '77', '74'], answer_index: 1 },
      yourValue: 1,
      onAnswer: () => {},
    })
    expect(screen.getByRole('heading', { name: 'Death' })).toBeTruthy()
    expect(buttons()).toHaveLength(3)
  })

  it('draws an NPC it has no copy for as the Mysterious Old Man, and says nothing about it', () => {
    const warn = vi.spyOn(console, 'warn')
    const error = vi.spyOn(console, 'error')
    render(RandomEvent, {
      question: event({ random_event: 'rick_turpentine' }),
      yourValue: null,
      onAnswer: () => {},
    })
    expect(screen.getByRole('heading', { name: 'Mysterious Old Man' })).toBeTruthy()
    expect(screen.getByText('Which prayer level unlocks Augury?')).toBeTruthy()
    expect(warn).not.toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()
  })

  it('stands the NPC on the right of the round host’s scroll, the host gone', () => {
    const { container } = render(RandomEvent, { question: event(), yourValue: null, onAnswer: () => {} })
    const row = container.querySelector('.stage-row')!
    expect(row.classList.contains('event')).toBe(true)
    const npcs = [...row.querySelectorAll('.npc')].map((npc) => npc.classList[1])
    expect(npcs).toEqual(['host', 'guest'])
    expect(row.querySelector('.paper')?.textContent).toContain('Which prayer level unlocks Augury?')
  })

  it('plays the entrance only with the hold still ahead', () => {
    const entering = (patch: Partial<OpenQuestion>, reveal: Record<string, unknown> | null = null) => {
      const { container, unmount } = render(RandomEvent, {
        question: event(patch),
        reveal,
        yourValue: null,
        onAnswer: () => {},
      })
      const played = container.querySelector('.stage-row')!.classList.contains('entering')
      unmount()
      return played
    }
    expect(entering({})).toBe(true)
    // A reconnect with 300 ms of hold left, and a question with no hold, start in place.
    expect(entering({ answerable_at: new Date(NOW + 300).toISOString() })).toBe(false)
    expect(entering({ answerable_at: new Date(NOW).toISOString() })).toBe(false)
    expect(entering({}, { prompt: 'Which prayer level unlocks Augury?', options: ['70', '77', '74'], answer_index: 1 })).toBe(false)
  })
})
