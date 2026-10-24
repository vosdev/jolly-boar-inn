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

import { interludeFor } from '../lib/interlude'
import type { OpenQuestion } from '../lib/protocol'
import { RANDOM_EVENTS } from '../lib/randomEvents'
import { serverOffsetMs } from '../lib/stores'
import { seen, spoken, typing } from '../test-typing'
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
    picture: null,
    answered: 0,
    of: 0,
    waiting: [],
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
  it('draws the NPC and the question, and holds the answers back', async () => {
    render(RandomEvent, { question: event(), yourValue: null, onAnswer: () => {} })
    expect(screen.getByRole('heading', { name: 'Death' })).toBeTruthy()
    expect(screen.getByText('Which prayer level unlocks Augury?')).toBeTruthy()
    expect(buttons()).toHaveLength(0)
    // The panel is there at its full size, its buttons drawn and out of reach.
    const gate = document.querySelector('.answers .gate')!
    expect(gate.classList.contains('held')).toBe(true)
    expect((gate as HTMLElement).inert).toBe(true)
    expect(gate.querySelectorAll('button')).toHaveLength(3)

    await after(1990)
    expect(buttons()).toHaveLength(0)
    await after(20)
    expect(buttons().map((b) => b.textContent?.trim())).toEqual(['70', '77', '74'])
    expect(gate.classList.contains('held')).toBe(false)
    expect((gate as HTMLElement).inert).toBe(false)
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
    const old: Partial<OpenQuestion> = event()
    delete old.answerable_at
    render(RandomEvent, { question: old as OpenQuestion, yourValue: null, onAnswer: () => {} })
    expect(buttons()).toHaveLength(6)
  })

  it('keeps the NPC on the reveal, with nothing held', () => {
    render(RandomEvent, {
      question: event(),
      reveal: {
        prompt: 'Which prayer level unlocks Augury?',
        options: ['70', '77', '74'],
        answer_index: 1,
      },
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
    const { container } = render(RandomEvent, {
      question: event(),
      yourValue: null,
      onAnswer: () => {},
    })
    const row = container.querySelector('.stage-row')!
    expect(row.classList.contains('event')).toBe(true)
    const npcs = [...row.querySelectorAll('.npc')].map((npc) => npc.classList[1])
    expect(npcs).toEqual(['host', 'guest'])
    expect(row.querySelector('.paper')?.textContent).toContain('Which prayer level unlocks Augury?')
  })

  it('plays the entrance only for a question that just opened, with the hold still ahead', () => {
    const entering = (
      patch: Partial<OpenQuestion>,
      reveal: Record<string, unknown> | null = null,
      live = true,
    ) => {
      const { container, unmount } = render(RandomEvent, {
        question: event(patch),
        reveal,
        yourValue: null,
        onAnswer: () => {},
        live,
      })
      const played = container.querySelector('.stage-row')!.classList.contains('entering')
      unmount()
      return played
    }
    expect(entering({})).toBe(true)
    // A reconnect with 300 ms of hold left, and a question with no hold, start in place.
    expect(entering({ answerable_at: new Date(NOW + 300).toISOString() })).toBe(false)
    expect(entering({ answerable_at: new Date(NOW).toISOString() })).toBe(false)
    // A reconnect with all the hold ahead lands settled too: no replay.
    expect(entering({}, null, false)).toBe(false)
    expect(
      entering(
        {},
        {
          prompt: 'Which prayer level unlocks Augury?',
          options: ['70', '77', '74'],
          answer_index: 1,
        },
      ),
    ).toBe(false)
  })
})

describe('the interlude', () => {
  const PROMPT = 'Which prayer level unlocks Augury?'
  const HOLD = 3500

  function live(patch: Partial<OpenQuestion> = {}, hold = HOLD) {
    return render(RandomEvent, {
      question: event({ answerable_at: new Date(NOW + hold).toISOString(), ...patch }),
      yourValue: null,
      onAnswer: () => {},
      live: true,
    })
  }

  const ask = () => document.querySelector('.paper .ask')!
  /** What a screen reader gets of the prompt: everything not hidden from it. */
  function spoken(): string {
    const copy = ask().cloneNode(true) as Element
    copy.querySelectorAll('[aria-hidden="true"]').forEach((hidden) => hidden.remove())
    return copy.textContent ?? ''
  }
  /** What the eye gets of it: the letters typed so far. */
  function seen(): string {
    const mask = ask().querySelector('[aria-hidden="true"]')
    if (mask === null) return ask().textContent ?? ''
    return [...mask.childNodes]
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent)
      .join('')
  }
  const row = () => document.querySelector('.stage-row')!

  it('shows the NPC’s name from the first frame, and types the prompt from 900 ms', async () => {
    live()
    expect(screen.getByRole('heading', { name: 'Death' })).toBeTruthy()
    expect(row().classList.contains('entering')).toBe(true)
    expect(seen()).toBe('')
    await after(899)
    expect(seen()).toBe('')
    // 50 letters a second: 25 of them half a second in.
    await after(501)
    expect(seen()).toBe([...PROMPT].slice(0, 25).join(''))
  })

  it('gives a screen reader the whole prompt once, from the first frame', async () => {
    live()
    expect(spoken()).toBe(PROMPT)
    await after(1000)
    expect(spoken()).toBe(PROMPT)
    await after(2000)
    expect(spoken()).toBe(PROMPT)
    expect(ask().textContent).toBe(PROMPT)
  })

  it.each([HOLD, 1000])(
    'is settled 200 ms before the answers at a %i ms hold, which wait for answerable_at',
    async (hold) => {
      const long = 'x'.repeat(300)
      live({ view: { prompt: long, options: ['70', '77', '74'] } }, hold)
      await after(hold - 201)
      expect(seen()).not.toBe(long)
      await after(1)
      expect(seen()).toBe(long)
      expect(ask().querySelector('[aria-hidden]')).toBeNull()
      await after(198)
      expect(buttons()).toHaveLength(0)
      await after(2)
      expect(buttons()).toHaveLength(3)
    },
  )

  it('has the NPC simply in place when there is no hold', () => {
    live({}, 0)
    expect(row().classList.contains('entering')).toBe(false)
    expect(seen()).toBe(PROMPT)
    expect(buttons()).toHaveLength(3)
  })

  it('lands a reconnect inside the hold on the settled stage, still waiting', async () => {
    render(RandomEvent, {
      question: event({ answerable_at: new Date(NOW + 1500).toISOString() }),
      yourValue: null,
      onAnswer: () => {},
    })
    expect(row().classList.contains('entering')).toBe(false)
    expect(seen()).toBe(PROMPT)
    await after(1490)
    expect(buttons()).toHaveLength(0)
    await after(20)
    expect(buttons()).toHaveLength(3)
  })

  it('with reduced motion, neither slides nor types, and the answers still wait', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
    }))
    try {
      live()
      expect(row().classList.contains('entering')).toBe(false)
      expect(seen()).toBe(PROMPT)
      expect(buttons()).toHaveLength(0)
      await after(HOLD)
      expect(buttons()).toHaveLength(3)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('hands the stage back to the host in the reveal’s last 900 ms', async () => {
    render(RandomEvent, {
      question: event(),
      reveal: { prompt: PROMPT, options: ['70', '77', '74'], answer_index: 1 },
      yourValue: 1,
      onAnswer: () => {},
      nextAt: new Date(NOW + 8000).toISOString(),
    })
    expect(row().classList.contains('event')).toBe(true)
    expect(row().classList.contains('returning')).toBe(false)
    await after(7090)
    expect(row().classList.contains('returning')).toBe(false)
    await after(20)
    expect(row().classList.contains('returning')).toBe(true)
    expect(row().classList.contains('event')).toBe(false)
  })

  it('keeps the NPC to the end of a reveal nothing follows', async () => {
    render(RandomEvent, {
      question: event(),
      reveal: { prompt: PROMPT, options: ['70', '77', '74'], answer_index: 1 },
      yourValue: 1,
      onAnswer: () => {},
      nextAt: null,
    })
    await after(60_000)
    expect(row().classList.contains('returning')).toBe(false)
  })

  it('puts the explanation on the scroll in the reveal, not under it', () => {
    const why = 'Augury needs 77 Prayer and Sins of the Father.'
    render(RandomEvent, {
      question: event(),
      reveal: { prompt: PROMPT, options: ['70', '77', '74'], answer_index: 1, explanation: why },
      yourValue: 1,
      onAnswer: () => {},
    })
    expect(screen.getAllByText(why)).toHaveLength(1)
    expect(document.querySelector('.paper')?.textContent).toContain(why)
    expect(document.querySelector('.answers')?.textContent).not.toContain(why)
  })
})

describe('the NPC’s own words', () => {
  const INTRO = 'Mortals spend millions on ancient scrolls just to bolster their defences.'
  const PROMPT = 'Which prayer level unlocks Augury?'
  const death = RANDOM_EVENTS.find((npc) => npc.id === 'death')!
  const introduced = (patch: Partial<OpenQuestion> = {}) =>
    event({
      answerable_at: new Date(NOW + 6000).toISOString(),
      view: { intro: INTRO, prompt: PROMPT, options: ['70', '77', '74'] },
      ...patch,
    })
  const intro = () => document.querySelector('.paper .intro')!
  const ask = () => document.querySelector('.paper .ask')!
  function seen(line: Element): string {
    const mask = line.querySelector('[aria-hidden="true"]')
    if (mask === null) return line.textContent ?? ''
    return [...mask.childNodes]
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent)
      .join('')
  }
  function spoken(line: Element): string {
    const copy = line.cloneNode(true) as Element
    copy.querySelectorAll('[aria-hidden="true"]').forEach((hidden) => hidden.remove())
    return copy.textContent ?? ''
  }

  it('types the intro, waits, then types the question, all settled before the answers', async () => {
    // The card keeps to the plan `lib/interlude.ts` makes, which its own tests hold to the
    // design; here it is only the card's clock.
    const [said, asked] = interludeFor(6000, [[...INTRO].length, [...PROMPT].length]).lines
    const introDone = Math.ceil(said!.from + said!.for)
    const askFrom = Math.floor(asked!.from)
    const halfway = Math.ceil(asked!.for / 2)
    render(RandomEvent, { question: introduced(), yourValue: null, onAnswer: () => {}, live: true })
    expect(seen(intro())).toBe('')
    expect(seen(ask())).toBe('')
    await after(introDone)
    expect(seen(intro())).toBe(INTRO)
    expect(seen(ask())).toBe('')
    await after(askFrom - introDone)
    expect(seen(ask())).toBe('')
    await after(halfway)
    expect(seen(ask()).length).toBeGreaterThan(0)
    expect(PROMPT.startsWith(seen(ask()))).toBe(true)
    await after(6000 - 200 - askFrom - halfway)
    expect(seen(ask())).toBe(PROMPT)
    expect(buttons()).toHaveLength(0)
    await after(200)
    expect(buttons()).toHaveLength(3)
  })

  it('gives a screen reader the intro and the question once each, whole, from the first frame', () => {
    render(RandomEvent, { question: introduced(), yourValue: null, onAnswer: () => {}, live: true })
    expect(spoken(intro())).toBe(INTRO)
    expect(spoken(ask())).toBe(PROMPT)
  })

  it('hides the intro in the reveal but keeps its room under the question', () => {
    render(RandomEvent, {
      question: introduced(),
      reveal: { intro: INTRO, prompt: PROMPT, options: ['70', '77', '74'], answer_index: 1 },
      yourValue: 1,
      onAnswer: () => {},
    })
    expect(ask().textContent).toBe(PROMPT)
    const kept = intro()
    expect(kept.classList.contains('kept')).toBe(true)
    expect(kept.getAttribute('aria-hidden')).toBe('true')
    expect(ask().compareDocumentPosition(kept) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it.each([
    ['an answer that scored', { value: 1, correct: true, credit: 1, points: 900 }, death.right],
    ['a wrong answer', { value: 0, correct: false, credit: 0, points: 0 }, death.wrong],
    ['no answer', null, death.wrong],
  ])('says its verdict on %s beside the points', (_, result, words) => {
    render(RandomEvent, {
      question: introduced(),
      reveal: { prompt: PROMPT, options: ['70', '77', '74'], answer_index: 1 },
      yourValue: result?.value ?? null,
      result,
      onAnswer: () => {},
    })
    expect(document.querySelector('.said .reaction')?.textContent).toBe(words)
  })

  it('says nothing to somebody the question was not theirs to answer, nor while it is open', () => {
    const { unmount } = render(RandomEvent, {
      question: introduced({ you_can_answer: false }),
      reveal: { prompt: PROMPT, options: ['70', '77', '74'], answer_index: 1 },
      yourValue: null,
      onAnswer: () => {},
    })
    expect(document.querySelector('.reaction')).toBeNull()
    unmount()
    render(RandomEvent, { question: introduced(), yourValue: null, onAnswer: () => {} })
    expect(document.querySelector('.reaction')).toBeNull()
  })
})

describe('an event with no prompt of its own', () => {
  it('types its stem as a round’s question would, after the entrance', async () => {
    const question = event({
      type: 'price_is_right',
      mode: 'price_is_right',
      answerable_at: new Date(NOW + 4000).toISOString(),
      view: { subject: { name: 'Coal' }, options: [1, 2, 3, 4], as_of: '2026-09-01' },
    })
    render(RandomEvent, { question, yourValue: null, onAnswer: () => {}, live: true })
    const name = document.querySelector('.paper .subject')!
    expect(seen(name)).toBe('')
    expect(spoken(name)).toBe('Coal')
    await after(4000)
    expect(typing(name)).toBe(false)
    expect(name.textContent).toBe('Coal')
  })
})
