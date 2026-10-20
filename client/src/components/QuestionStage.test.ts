/**
 * A round's question on the stage: its stem typed onto the scroll in the hold the server
 * gives it, and the answers under the line held back until `answerable_at`.
 *
 * The clock is faked so the hold is counted, not waited out.
 */

import { render, screen } from '@testing-library/svelte'
import { tick } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { interludeFor } from '../lib/interlude'
import type { OpenQuestion } from '../lib/protocol'
import { serverOffsetMs } from '../lib/stores'
import { seen, spoken, typing } from '../test-typing'
import QuestionStage from './QuestionStage.svelte'

const NOW = Date.parse('2026-10-09T20:00:00Z')
const PROMPT = 'What is the combat level of a Black demon?'
const HOLD = 2000

function open(patch: Partial<OpenQuestion> = {}, hold = HOLD): OpenQuestion {
  return {
    question_id: 'q1',
    index: 0,
    total: 10,
    type: 'multiple_choice',
    mode: 'bestiary',
    segment: { mode: 'bestiary', index: 0, total: 1, start: 0, count: 10 },
    view: { prompt: PROMPT, options: ['172', '184', '178', '190'] },
    opened_at: new Date(NOW).toISOString(),
    answerable_at: new Date(NOW + hold).toISOString(),
    ends_at: new Date(NOW + hold + 15_000).toISOString(),
    you_can_answer: true,
    picture: null,
    random_event: null,
    answered: 0,
    of: 0,
    ...patch,
  }
}

function stage(question: OpenQuestion, live = true, reveal: Record<string, unknown> | null = null) {
  return render(QuestionStage, { question, reveal, yourValue: null, onAnswer: () => {}, live })
}

const buttons = () => screen.queryAllByRole('button')
const ask = () => document.querySelector('.paper .ask')!

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

describe('a round’s question typing in', () => {
  it('types the prompt from 400 ms at 50 letters a second', async () => {
    stage(open())
    expect(seen(ask())).toBe('')
    await after(399)
    expect(seen(ask())).toBe('')
    await after(501)
    expect(seen(ask())).toBe([...PROMPT].slice(0, 25).join(''))
  })

  it('holds the answers, drawn and out of reach, until answerable_at', async () => {
    stage(open())
    const gate = document.querySelector('.answers .gate') as HTMLElement
    expect(gate.classList.contains('held')).toBe(true)
    expect(gate.inert).toBe(true)
    expect(buttons()).toHaveLength(0)
    await after(HOLD - 201)
    expect(typing(ask())).toBe(false)
    expect(buttons()).toHaveLength(0)
    await after(201)
    expect(buttons()).toHaveLength(4)
    expect(gate.inert).toBe(false)
  })

  it('is settled 200 ms before the answers when the hold is short of the natural pace', async () => {
    stage(open({}, 1000))
    await after(799)
    expect(typing(ask())).toBe(true)
    await after(1)
    expect(typing(ask())).toBe(false)
  })

  it('gives a screen reader the whole prompt from the first frame', () => {
    stage(open())
    expect(spoken(ask())).toBe(PROMPT)
  })

  it('lands a reconnect inside the hold on the whole prompt, the answers still waiting', async () => {
    stage(open(), false)
    expect(typing(ask())).toBe(false)
    expect(buttons()).toHaveLength(0)
    await after(HOLD)
    expect(buttons()).toHaveLength(4)
  })

  it('with reduced motion shows the prompt whole, and the answers still wait', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
    }))
    try {
      stage(open())
      expect(typing(ask())).toBe(false)
      expect(buttons()).toHaveLength(0)
      await after(HOLD)
      expect(buttons()).toHaveLength(4)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('offers the answers at once, with no gate, for a question with no hold', () => {
    stage(open({}, 0))
    expect(typing(ask())).toBe(false)
    expect(document.querySelector('.gate')).toBeNull()
    expect(buttons()).toHaveLength(4)
  })

  it('types a quote’s question, pauses, then the quote', async () => {
    const view = { prompt: 'Who said it?', quote: 'Buying gf', options: ['A', 'B', 'C', 'D'] }
    const [, quoted] = interludeFor(3000, [12, 9], 400, 0).lines
    stage(open({ mode: 'who_said_that', view }, 3000))
    const caption = document.querySelector('.paper figcaption')!
    const quote = document.querySelector('.paper blockquote')!
    await after(Math.floor(quoted!.from))
    expect(seen(caption)).toBe('Who said it?')
    expect(seen(quote)).toBe('')
    await after(Math.ceil(quoted!.from + quoted!.for) - Math.floor(quoted!.from))
    expect(seen(quote)).toBe('Buying gf')
  })

  it('types more_less’s question with its direction word set apart', async () => {
    const view = {
      metric: 'ge_price',
      direction: 'less',
      options: [{ subject: { name: 'Abyssal whip' } }, { subject: { name: 'Dragon bones' } }],
      as_of: '2026-09-01',
    }
    stage(open({ type: 'more_less', mode: 'more_less', view }, 3000))
    const line = 'Which costs less on the Grand Exchange?'
    expect(spoken(ask())).toBe(line)
    await after(400 + 240)
    expect(seen(ask())).toBe('Which costs ')
    await after(60)
    expect(seen(ask())).toBe('Which costs les')
    expect(ask().querySelector('[aria-hidden] .word.less')?.textContent).toBe('les')
    await after(3000)
    expect(ask().querySelector('.word.less')?.textContent).toBe('less')
  })

  it('shows the reveal whole', () => {
    stage(open(), false, { prompt: PROMPT, options: ['172', '184', '178', '190'], answer_index: 0 })
    expect(typing(ask())).toBe(false)
    expect(ask().textContent).toBe(PROMPT)
  })
})
