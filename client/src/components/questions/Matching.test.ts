/**
 * `matching` on screen: dragging an option onto each field, from a pointer or the keyboard,
 * sending one back, starting over, sending with Submit or on its own before time runs
 * out, icon fields, and a reveal that sets each right option on its field.
 */

import { fireEvent, render, screen } from '@testing-library/svelte'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { OpenQuestion } from '../../lib/protocol'
import { field, fields, limit } from '../../lib/questionSchema'
import { GEMS } from './GemButton.svelte'
import { viewFor } from './index'
import Question from './Question.svelte'
import TextStem from './stems/TextStem.svelte'
import Matching from './types/Matching.svelte'

const BOSSES = ['Zulrah', 'Vorkath', 'Kraken', 'Sarachnis']
// As the server shuffles them: Zul-Andra belongs on Zulrah, Karuulm on nothing.
const SHOWN = ['Forthos Dungeon', 'Zul-Andra', 'Ungael', 'Kraken Cove', 'Karuulm Slayer Dungeon']
const VIEW = {
  prompt: 'Match each boss to where it is fought.',
  fields: BOSSES.map((text) => ({ text })),
  options: SHOWN.map((text) => ({ text })),
}
const REVEAL = {
  ...VIEW,
  options: SHOWN.map((text) => (text === 'Zul-Andra' ? { text, detail: 'Tirannwn' } : { text })),
  answer: [1, 2, 3, 0],
}

function open(view: Record<string, unknown> = VIEW, youCanAnswer = true): OpenQuestion {
  return {
    question_id: 'q1',
    index: 0,
    total: 5,
    type: 'matching',
    mode: 'custom',
    segment: { mode: 'custom', index: 0, total: 1, start: 0, count: 5 },
    view,
    opened_at: '2026-10-04T20:00:00Z',
    ends_at: '2026-10-04T20:00:25Z',
    you_can_answer: youCanAnswer,
    picture: null,
    random_event: null,
    answerable_at: '2026-10-04T20:00:00Z',
    answered: 0,
    of: 0,
    waiting: [],
  }
}

const handle = (name: string) =>
  screen.getByRole('button', { name: `Move ${name}` }) as HTMLButtonElement
const submit = () => screen.getByRole('button', { name: 'Submit' }) as HTMLButtonElement
const rewind = () => screen.getByRole('button', { name: 'Start over' }) as HTMLButtonElement
/** The option on each field, null where a field is empty. */
const placed = () =>
  [...document.querySelectorAll('ol.fields > li')].map(
    (li) => li.querySelector('.slot .content')?.textContent ?? null,
  )
const tray = () => [...document.querySelectorAll('.tray .content')].map((text) => text.textContent)
const press = (name: string, key: string) => fireEvent.keyDown(handle(name), { key })

/** Lifts `name`, steps it up `times`, and drops it. */
async function raise(name: string, times: number): Promise<void> {
  await press(name, ' ')
  for (let step = 0; step < times; step += 1) await press(name, 'ArrowUp')
  await press(name, ' ')
}

/** Fields 60px apart from the top of the window, and the tray from 400px. */
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

/** Drags `name` by its handle to `y`. */
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
  vi.setSystemTime(new Date('2026-10-04T20:00:15Z'))
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('matching', () => {
  it('is drawn by the text stem over its own view', () => {
    expect(viewFor('matching', 'custom')).toEqual({ stem: TextStem, view: Matching })
  })

  it('reads the fields the schema gives it, on no more gems than there are', () => {
    expect(fields('matching')).toEqual(
      expect.arrayContaining(['prompt', 'fields', 'options', 'answer']),
    )
    expect(limit(field('matching', 'options'), 'maxItems')).toBe(GEMS.length)
  })

  it('starts with every field empty over a tray of every option, and Submit waits', () => {
    render(Question, { question: open(), yourValue: null, onAnswer: () => {} })
    expect(screen.getByText('Drag one onto each; 1 will be left over')).toBeTruthy()
    expect(placed()).toEqual([null, null, null, null])
    expect(tray()).toEqual(SHOWN)
    expect(submit().disabled).toBe(true)
    expect(rewind().disabled).toBe(true)
  })

  it('fills every field by dragging, and sends the option on each in field order', async () => {
    layout()
    const onAnswer = vi.fn()
    render(Question, { question: open(), yourValue: null, onAnswer })
    await dragTo('Karuulm Slayer Dungeon', 10)
    await dragTo('Ungael', 70)
    await dragTo('Kraken Cove', 130)
    await dragTo('Forthos Dungeon', 190)
    expect(placed()).toEqual(['Karuulm Slayer Dungeon', 'Ungael', 'Kraken Cove', 'Forthos Dungeon'])
    expect(submit().disabled).toBe(false)
    await dragTo('Zul-Andra', 10)
    expect(placed()).toEqual(['Zul-Andra', 'Ungael', 'Kraken Cove', 'Forthos Dungeon'])
    expect(tray()).toEqual(['Karuulm Slayer Dungeon'])
    await dragTo('Ungael', 130)
    expect(placed()).toEqual(['Zul-Andra', 'Kraken Cove', 'Ungael', 'Forthos Dungeon'])
    await dragTo('Ungael', 70)
    await fireEvent.click(submit())
    expect(onAnswer).toHaveBeenCalledExactlyOnceWith([1, 2, 3, 0])
  })

  it('fills every field from the keyboard: space lifts, the arrows move, space drops', async () => {
    const onAnswer = vi.fn()
    render(Question, { question: open(), yourValue: null, onAnswer })
    await press('Zul-Andra', ' ')
    await press('Zul-Andra', 'ArrowUp')
    await press('Zul-Andra', 'ArrowUp')
    await press('Zul-Andra', 'ArrowUp')
    await press('Zul-Andra', 'ArrowUp')
    expect(document.activeElement).toBe(handle('Zul-Andra'))
    await press('Zul-Andra', ' ')
    await raise('Ungael', 3)
    await raise('Kraken Cove', 2)
    await raise('Forthos Dungeon', 1)
    expect(placed()).toEqual(['Zul-Andra', 'Ungael', 'Kraken Cove', 'Forthos Dungeon'])
    await fireEvent.click(submit())
    expect(onAnswer).toHaveBeenCalledExactlyOnceWith([1, 2, 3, 0])
  })

  it('sends a placed option back with its ×, and empties every field on Start over', async () => {
    render(Question, { question: open(), yourValue: null, onAnswer: () => {} })
    await raise('Zul-Andra', 4)
    await raise('Ungael', 3)
    await raise('Kraken Cove', 2)
    await raise('Forthos Dungeon', 1)
    expect(submit().disabled).toBe(false)
    await fireEvent.click(screen.getByRole('button', { name: 'Take Ungael off' }))
    expect(placed()).toEqual(['Zul-Andra', null, 'Kraken Cove', 'Forthos Dungeon'])
    expect(tray()).toEqual(['Ungael', 'Karuulm Slayer Dungeon'])
    expect(submit().disabled).toBe(true)
    await fireEvent.click(rewind())
    expect(placed()).toEqual([null, null, null, null])
    expect(tray()).toEqual(SHOWN)
    expect(rewind().disabled).toBe(true)
  })

  it('sends on its own a second before time runs out, empty fields filled from the tray', async () => {
    closingSoon()
    const onAnswer = vi.fn()
    render(Question, { question: open(), yourValue: null, onAnswer })
    await raise('Ungael', 4)
    vi.advanceTimersByTime(8_999)
    expect(onAnswer).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onAnswer).toHaveBeenCalledExactlyOnceWith([2, 0, 1, 3])
  })

  it('sends nothing on its own once sent, or for somebody who cannot answer', () => {
    closingSoon()
    const onAnswer = vi.fn()
    render(Question, { question: open(), yourValue: [1, 2, 3, 0], onAnswer })
    render(Question, { question: open(VIEW, false), yourValue: null, onAnswer })
    vi.advanceTimersByTime(20_000)
    expect(onAnswer).not.toHaveBeenCalled()
  })

  it('once sent, holds our matches with no handles, ×, Submit or Start over', () => {
    render(Question, { question: open(), yourValue: [1, 2, 3, 0], onAnswer: () => {} })
    expect(placed()).toEqual(['Zul-Andra', 'Ungael', 'Kraken Cove', 'Forthos Dungeon'])
    expect(screen.queryAllByRole('button', { name: /^(Move|Take) / })).toHaveLength(0)
    expect(screen.queryByRole('button', { name: 'Submit' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Start over' })).toBeNull()
  })

  it('shows an icon field by its picture, called Picture N without a name', () => {
    const view = {
      ...VIEW,
      fields: [
        { picture: '0123456789abcdef.png' },
        { text: 'Kraken tentacle', picture: 'fedcba9876543210.png' },
        {},
        { text: 'Basilisk jaw' },
      ],
    }
    render(Question, { question: open(view), yourValue: null, onAnswer: () => {} })
    const icon = screen.getByRole('img', { name: 'Picture 1' }) as HTMLImageElement
    expect(icon.getAttribute('src')).toBe('/pictures/0123456789abcdef.png')
    const named = document.querySelector('img[src="/pictures/fedcba9876543210.png"]')
    expect(named?.getAttribute('alt')).toBe('')
    expect(screen.getByText('Kraken tentacle')).toBeTruthy()
    expect(screen.getByText('Picture 3')).toBeTruthy()
    expect(document.querySelector('ol.fields > li .empty')?.textContent).toBe('Picture 1, empty')
  })

  it('reveals the right option on each field, our wrong picks and the decoys', () => {
    render(Question, {
      question: open(),
      reveal: REVEAL,
      yourValue: [1, 4, 3, 0],
      result: { value: [1, 4, 3, 0], correct: false, credit: 0.75, points: 675 },
      onAnswer: () => {},
    })
    const rows = [...document.querySelectorAll('ol.fields > li')]
    expect(rows.map((row) => row.querySelector('.text')?.textContent)).toEqual([
      'Zul-Andra',
      'Ungael',
      'Kraken Cove',
      'Forthos Dungeon',
    ])
    const faded = rows.map((row) => row.querySelector('.gem')?.classList.contains('faded'))
    expect(faded).toEqual([false, true, false, false])
    expect(rows[1]?.textContent).toContain('you: Karuulm Slayer Dungeon')
    expect(rows[0]?.textContent).toContain('Tirannwn')
    expect(rows[0]?.textContent).not.toContain('you:')
    expect(screen.getByText('Left over: Karuulm Slayer Dungeon')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Submit' })).toBeNull()
  })
})
