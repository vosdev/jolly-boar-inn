/**
 * `pick_all_that_apply` on screen: dragging the right options into a basket, by pointer or
 * keyboard, sending them with Submit or on their own before time runs out, and a reveal
 * that lights every right option and marks each of ours.
 */

import { fireEvent, render, screen, within } from '@testing-library/svelte'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { OpenQuestion } from '../../lib/protocol'
import { field, fields, limit } from '../../lib/questionSchema'
import { GEMS } from './GemButton.svelte'
import { viewFor } from './index'
import Question from './Question.svelte'
import TextStem from './stems/TextStem.svelte'
import PickAllThatApply from './types/PickAllThatApply.svelte'

const OPTIONS = ['Kalphite Queen', 'Sarachnis', 'Scorpia', 'Venenatis']
const VIEW = { prompt: 'Which of these bosses are spiders?', options: OPTIONS }
const REVEAL = { ...VIEW, answer_indices: [1, 3] }

function open(view: Record<string, unknown> = VIEW, youCanAnswer = true): OpenQuestion {
  return {
    question_id: 'q1',
    index: 0,
    total: 5,
    type: 'pick_all_that_apply',
    mode: 'custom',
    segment: { mode: 'custom', index: 0, total: 1, start: 0, count: 5 },
    view,
    opened_at: '2026-10-03T20:00:00Z',
    ends_at: '2026-10-03T20:00:20Z',
    you_can_answer: youCanAnswer,
    picture: null,
    random_event: null,
    answerable_at: '2026-10-03T20:00:00Z',
    answered: 0,
    of: 0,
  }
}

const gem = (name: string) => screen.getByText(name).closest('button') as HTMLButtonElement
const submit = () => screen.getByRole('button', { name: 'Submit' }) as HTMLButtonElement
const rewind = () => screen.getByRole('button', { name: 'Start over' }) as HTMLButtonElement
const handle = (name: string) =>
  screen.getByRole('button', { name: `Move ${name}` }) as HTMLButtonElement
const press = (name: string, key: string) => fireEvent.keyDown(handle(name), { key })
const texts = (selector: string) =>
  [...document.querySelectorAll(`${selector} .content`)].map((node) => node.textContent)
const basket = () => texts('.basket')
const tray = () => texts('.tray')

/** Lifts `name` and puts it in the basket from the keyboard. */
async function choose(name: string): Promise<void> {
  await press(name, ' ')
  await press(name, 'ArrowUp')
  await press(name, ' ')
}

/** The basket's places 60px apart from the top of the window, the tray from 400px. */
function layout(): void {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    const inTray = this.dataset.tray !== undefined
    const top =
      this.dataset.place !== undefined ? Number(this.dataset.place) * 60 : inTray ? 400 : 0
    const height = inTray ? 300 : 56
    return {
      top,
      bottom: top + height,
      left: 0,
      right: 300,
      width: 300,
      height,
      x: 0,
      y: top,
    } as DOMRect
  })
}

async function dragTo(name: string, y: number): Promise<void> {
  const grip = handle(name)
  await fireEvent.pointerDown(grip, { pointerId: 1, button: 0, clientY: 450 })
  await fireEvent.pointerMove(grip, { pointerId: 1, button: 0, clientY: y })
  await fireEvent.pointerUp(grip, { pointerId: 1, button: 0, clientY: y })
}

/** Ten seconds before `open()`'s question closes, on a clock the test moves. */
function closingSoon(): void {
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
  })
  vi.setSystemTime(new Date('2026-10-03T20:00:10Z'))
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('pick_all_that_apply', () => {
  it('is drawn by the text stem over its own view', () => {
    expect(viewFor('pick_all_that_apply', 'custom')).toEqual({
      stem: TextStem,
      view: PickAllThatApply,
    })
  })

  it('reads the fields the schema gives it, on no more gems than there are', () => {
    expect(fields('pick_all_that_apply')).toEqual(
      expect.arrayContaining(['prompt', 'options', 'answer_indices', 'picks']),
    )
    expect(limit(field('pick_all_that_apply', 'options'), 'maxItems')).toBe(GEMS.length)
  })

  it('asks for all that apply, or for as many as the question says', () => {
    const free = render(Question, { question: open(), yourValue: null, onAnswer: () => {} })
    expect(screen.getByText('Pick all that apply')).toBeTruthy()
    free.unmount()
    render(Question, { question: open({ ...VIEW, picks: 2 }), yourValue: null, onAnswer: () => {} })
    expect(screen.getByText('Pick 2')).toBeTruthy()
  })

  it('starts with an empty basket over every option, and Submit waits', () => {
    render(Question, { question: open(), yourValue: null, onAnswer: () => {} })
    expect(basket()).toEqual([])
    expect(tray()).toEqual(OPTIONS)
    expect(screen.getByText('Drag the right ones here')).toBeTruthy()
    expect(submit().disabled).toBe(true)
    expect(rewind().disabled).toBe(true)
  })

  it('drags options into a basket that grows, and back, fading nothing', async () => {
    layout()
    const onAnswer = vi.fn()
    render(Question, { question: open(), yourValue: null, onAnswer })
    await dragTo('Venenatis', 10)
    await dragTo('Kalphite Queen', 10)
    await dragTo('Sarachnis', 10)
    expect(basket()).toEqual(['Venenatis', 'Kalphite Queen', 'Sarachnis'])
    expect(document.querySelectorAll('.basket .tick')).toHaveLength(0)
    await dragTo('Kalphite Queen', 450)
    expect(basket()).toEqual(['Venenatis', 'Sarachnis'])
    expect(tray()).toEqual(['Kalphite Queen', 'Scorpia'])
    expect(document.querySelector('.faded')).toBeNull()
    expect(onAnswer).not.toHaveBeenCalled()
    await fireEvent.click(submit())
    expect(onAnswer).toHaveBeenCalledExactlyOnceWith([1, 3])
  })

  it('fills the basket from the keyboard: up puts one in, down takes it out', async () => {
    render(Question, { question: open(), yourValue: null, onAnswer: () => {} })
    await press('Scorpia', ' ')
    await press('Scorpia', 'ArrowUp')
    await press('Scorpia', 'ArrowDown')
    expect(basket()).toEqual([])
    await press('Scorpia', 'ArrowUp')
    await press('Scorpia', ' ')
    expect(basket()).toEqual(['Scorpia'])
    expect(submit().disabled).toBe(false)
  })

  it('takes one out with its ×, and empties the basket on Start over', async () => {
    render(Question, { question: open(), yourValue: null, onAnswer: () => {} })
    await choose('Sarachnis')
    await choose('Venenatis')
    await fireEvent.click(screen.getByRole('button', { name: 'Take Sarachnis out' }))
    expect(basket()).toEqual(['Venenatis'])
    await fireEvent.click(rewind())
    expect(basket()).toEqual([])
    expect(tray()).toEqual(OPTIONS)
  })

  it('with picks, offers that many places, swaps on a full one and submits only when full', async () => {
    layout()
    const onAnswer = vi.fn()
    render(Question, { question: open({ ...VIEW, picks: 2 }), yourValue: null, onAnswer })
    expect(screen.getAllByText('Drop one here')).toHaveLength(2)
    expect(screen.queryByText('Drag the right ones here')).toBeNull()
    await dragTo('Kalphite Queen', 10)
    expect(submit().disabled).toBe(true)
    await dragTo('Scorpia', 70)
    expect(basket()).toEqual(['Kalphite Queen', 'Scorpia'])
    expect(submit().disabled).toBe(false)
    await dragTo('Sarachnis', 10)
    expect(basket()).toEqual(['Sarachnis', 'Scorpia'])
    expect(tray()).toEqual(['Kalphite Queen', 'Venenatis'])
    await choose('Venenatis')
    expect(basket()).toEqual(['Sarachnis', 'Scorpia'])
    await fireEvent.click(submit())
    expect(onAnswer).toHaveBeenCalledExactlyOnceWith([1, 2])
  })

  it('sends the basket on its own a second before time runs out', async () => {
    closingSoon()
    const onAnswer = vi.fn()
    render(Question, { question: open(), yourValue: null, onAnswer })
    await choose('Venenatis')
    await choose('Sarachnis')
    vi.advanceTimersByTime(8_999)
    expect(onAnswer).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onAnswer).toHaveBeenCalledExactlyOnceWith([1, 3])
  })

  it('sends nothing on its own that the server would refuse', async () => {
    closingSoon()
    const onAnswer = vi.fn()
    render(Question, { question: open(), yourValue: null, onAnswer })
    const short = render(Question, {
      question: open({ ...VIEW, picks: 2 }),
      yourValue: null,
      onAnswer,
    })
    await fireEvent.keyDown(within(short.container).getByRole('button', { name: 'Move Scorpia' }), {
      key: ' ',
    })
    vi.advanceTimersByTime(20_000)
    expect(onAnswer).not.toHaveBeenCalled()
  })

  it('once sent, fades the rest and marks ours, with no boxes and no Submit', () => {
    render(Question, { question: open(), yourValue: [1, 2], onAnswer: () => {} })
    expect(document.querySelector('.tick')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Submit' })).toBeNull()
    expect(OPTIONS.map((name) => gem(name).disabled)).toEqual([true, true, true, true])
    expect(OPTIONS.map((name) => gem(name).classList.contains('faded'))).toEqual([
      true,
      false,
      false,
      true,
    ])
    expect(screen.getAllByText('you')).toHaveLength(2)
  })

  it('reveals every right option, lit, and a "you" on each of ours', () => {
    render(Question, {
      question: open(),
      reveal: REVEAL,
      yourValue: [1, 2],
      result: { value: [1, 2], correct: false, credit: 1 / 3, points: 300 },
      onAnswer: () => {},
    })
    const state = (name: string) =>
      ['correct', 'wrong', 'faded'].find((s) => gem(name).classList.contains(s))
    expect(OPTIONS.map(state)).toEqual(['faded', 'correct', 'wrong', 'correct'])
    // Ours and right; ours and wrong. Venenatis is right and lit, but was not ours.
    expect(gem('Sarachnis').textContent).toContain('you')
    expect(gem('Scorpia').textContent).toContain('you')
    expect(gem('Venenatis').textContent).not.toContain('you')
    // Several right answers stay their usual size, so the rest still fit under them.
    expect(gem('Sarachnis').classList.contains('normal')).toBe(true)
    expect(gem('Kalphite Queen').classList.contains('small')).toBe(true)
    expect(screen.queryByText('Pick all that apply')).toBeNull()
  })

  it('gives somebody who cannot answer neither boxes, handles nor Submit', () => {
    render(Question, { question: open(VIEW, false), yourValue: null, onAnswer: () => {} })
    expect(document.querySelector('.tick')).toBeNull()
    expect(screen.queryAllByRole('button', { name: /^Move / })).toHaveLength(0)
    expect(screen.queryByRole('button', { name: 'Submit' })).toBeNull()
  })
})
