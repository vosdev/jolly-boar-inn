/**
 * `ordering` on screen: dragging the entries into order by their handles, from a pointer
 * or the keyboard, starting over, sending the order with Submit or on its own before time
 * runs out, and a reveal that lists the right order and where ours went astray.
 */

import { fireEvent, render, screen } from '@testing-library/svelte'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { OpenQuestion } from '../../lib/protocol'
import { field, fields, limit } from '../../lib/questionSchema'
import { GEMS } from './GemButton.svelte'
import { viewFor } from './index'
import Question from './Question.svelte'
import TextStem from './stems/TextStem.svelte'
import Ordering, { dropAt, filled, placeNumbers, placement, stepped } from './types/Ordering.svelte'

// As the server shuffles them: Bronze is first by rank, Adamant last.
const SHOWN = ['Mithril', 'Bronze', 'Adamant', 'Iron', 'Steel']
const RANKS = [4, 1, 5, 2, 3]
const VIEW = {
  prompt: 'Put these metals in order.',
  ends: ['Weakest', 'Strongest'],
  entries: SHOWN.map((text) => ({ text })),
}
const REVEAL = {
  ...VIEW,
  entries: SHOWN.map((text, index) => ({
    text,
    rank: RANKS[index],
    detail: `Rank ${RANKS[index]}`,
  })),
  answer: [1, 3, 4, 0, 2],
}

// The top three of six, as the server shuffles them.
const ITEMS = [
  'Lobster',
  'Twisted bow',
  'Abyssal whip',
  'Scythe of vitur',
  'Rune platebody',
  'Tumeken',
]
const VALUES = [6, 1, 4, 2, 5, 3]
const PICKED = {
  prompt: 'The three most valuable.',
  ends: ['Most valuable', 'Least valuable'],
  entries: ITEMS.map((text) => ({ text })),
  picks: 3,
}
const PICKED_REVEAL = {
  ...PICKED,
  entries: ITEMS.map((text, index) => ({ text, rank: VALUES[index] })),
  answer: [1, 3, 5, 2, 4, 0],
}

function open(view: Record<string, unknown> = VIEW, youCanAnswer = true): OpenQuestion {
  return {
    question_id: 'q1',
    index: 0,
    total: 5,
    type: 'ordering',
    mode: 'custom',
    segment: { mode: 'custom', index: 0, total: 1, start: 0, count: 5 },
    view,
    opened_at: '2026-10-04T20:00:00Z',
    ends_at: '2026-10-04T20:00:25Z',
    you_can_answer: youCanAnswer,
  }
}

const gem = (name: string) => screen.getByText(name).closest('.gem') as HTMLElement
const handle = (name: string) =>
  screen.getByRole('button', { name: `Move ${name}` }) as HTMLButtonElement
const submit = () => screen.getByRole('button', { name: 'Submit' }) as HTMLButtonElement
const rewind = () => screen.getByRole('button', { name: 'Start over' }) as HTMLButtonElement
/** The entry at each place, null where a place is empty. */
const placed = () =>
  [...document.querySelectorAll('ol.entries > li')].map(
    (li) => li.querySelector('.content')?.textContent ?? null,
  )
const tray = () => [...document.querySelectorAll('.tray .content')].map((text) => text.textContent)
const news = () => document.querySelector('[aria-live]')?.textContent
const press = (name: string, key: string) => fireEvent.keyDown(handle(name), { key })

/** Places 60px apart from the top of the window, and the tray from 400px. */
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
  await fireEvent.pointerDown(grip, { pointerId: 1, button: 0, clientY: 300 })
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

describe('ordering', () => {
  it('is drawn by the text stem over its own view', () => {
    expect(viewFor('ordering', 'custom')).toEqual({ stem: TextStem, view: Ordering })
  })

  it('reads the fields the schema gives it, on no more gems than there are', () => {
    expect(fields('ordering')).toEqual(
      expect.arrayContaining(['prompt', 'ends', 'entries', 'answer']),
    )
    expect(limit(field('ordering', 'entries'), 'maxItems')).toBe(GEMS.length)
  })

  it('says which end comes first, on a gem that goes where its entry goes', async () => {
    render(Question, { question: open(), yourValue: null, onAnswer: () => {} })
    expect(screen.getByText('Drag into order: Weakest → Strongest')).toBeTruthy()
    const gems = () =>
      SHOWN.map((name) => [...gem(name).classList].find((c) => GEMS.includes(c as never)))
    expect(gems()).toEqual(GEMS.slice(0, SHOWN.length))
    await press('Bronze', ' ')
    await press('Bronze', 'ArrowUp')
    expect(placed()).toEqual(['Bronze', 'Mithril', 'Adamant', 'Iron', 'Steel'])
    expect(gems()).toEqual(GEMS.slice(0, SHOWN.length))
  })

  it('starts in the shown order, without numbers, and sends it at once if asked', async () => {
    const onAnswer = vi.fn()
    render(Question, { question: open(), yourValue: null, onAnswer })
    expect(placed()).toEqual(SHOWN)
    expect(document.querySelector('.tick')).toBeNull()
    expect(document.querySelector('.tray')).toBeNull()
    expect(rewind().disabled).toBe(true)
    await fireEvent.click(submit())
    expect(onAnswer).toHaveBeenCalledExactlyOnceWith([0, 1, 2, 3, 4])
  })

  it('moves a row from the keyboard: space lifts it, the arrows move it, space drops it', async () => {
    const onAnswer = vi.fn()
    render(Question, { question: open(), yourValue: null, onAnswer })
    await press('Bronze', 'ArrowUp')
    expect(placed()).toEqual(SHOWN)
    await press('Bronze', ' ')
    expect(news()).toContain('Bronze lifted, place 2 of 5')
    await press('Bronze', 'ArrowUp')
    expect(news()).toBe('Bronze, place 1 of 5')
    await press('Bronze', 'ArrowUp')
    expect(placed()).toEqual(['Bronze', 'Mithril', 'Adamant', 'Iron', 'Steel'])
    expect(document.activeElement).toBe(handle('Bronze'))
    await press('Bronze', ' ')
    expect(news()).toBe('Bronze dropped, place 1 of 5')
    await press('Bronze', 'ArrowDown')
    expect(placed()).toEqual(['Bronze', 'Mithril', 'Adamant', 'Iron', 'Steel'])
    await press('Steel', 'Enter')
    await press('Steel', 'ArrowDown')
    expect(placed()).toEqual(['Bronze', 'Mithril', 'Adamant', 'Iron', 'Steel'])
    await fireEvent.click(submit())
    expect(onAnswer).toHaveBeenCalledExactlyOnceWith([1, 0, 2, 3, 4])
  })

  it('puts a lifted row back where it was on Escape', async () => {
    render(Question, { question: open(), yourValue: null, onAnswer: () => {} })
    await press('Iron', ' ')
    await press('Iron', 'ArrowUp')
    await press('Iron', 'ArrowUp')
    await press('Iron', 'Escape')
    expect(placed()).toEqual(SHOWN)
    expect(news()).toBe('Iron put back, place 4 of 5')
    await press('Iron', 'ArrowUp')
    expect(placed()).toEqual(SHOWN)
  })

  it('moves a row dragged by its handle, and the rows between make room', async () => {
    layout()
    render(Question, { question: open(), yourValue: null, onAnswer: () => {} })
    const grip = handle('Steel')
    await fireEvent.pointerDown(grip, { pointerId: 1, button: 0, clientY: 268 })
    await fireEvent.pointerMove(grip, { pointerId: 1, button: 0, clientY: 70 })
    expect(document.querySelectorAll('li.over')).toHaveLength(1)
    expect(document.querySelector('li.over')?.getAttribute('data-place')).toBe('1')
    await fireEvent.pointerUp(grip, { pointerId: 1, button: 0, clientY: 70 })
    expect(placed()).toEqual(['Mithril', 'Steel', 'Bronze', 'Adamant', 'Iron'])
    expect(document.querySelector('.over')).toBeNull()
    await dragTo('Mithril', 250)
    expect(placed()).toEqual(['Steel', 'Bronze', 'Adamant', 'Iron', 'Mithril'])
  })

  it('drags the whole row with a mouse, but only the handle with a finger', async () => {
    layout()
    render(Question, { question: open(), yourValue: null, onAnswer: () => {} })
    const drop = async (target: Element, pointerType: string) => {
      await fireEvent.pointerDown(target, { pointerId: 2, button: 0, pointerType, clientY: 268 })
      await fireEvent.pointerMove(target, { pointerId: 2, button: 0, pointerType, clientY: 50 })
      await fireEvent.pointerUp(target, { pointerId: 2, button: 0, pointerType, clientY: 50 })
    }
    await drop(screen.getByText('Steel'), 'touch')
    expect(placed()).toEqual(SHOWN)
    await drop(screen.getByText('Steel'), 'mouse')
    expect(placed()).toEqual(['Steel', 'Mithril', 'Bronze', 'Adamant', 'Iron'])
    await drop(handle('Iron'), 'touch')
    expect(placed()).toEqual(['Iron', 'Steel', 'Mithril', 'Bronze', 'Adamant'])
  })

  it('keeps our order through a new copy of the question, and starts over for another', async () => {
    const { rerender } = render(Question, { question: open(), yourValue: null, onAnswer: () => {} })
    await press('Bronze', ' ')
    await press('Bronze', 'ArrowUp')
    await rerender({
      question: open({ ...VIEW, entries: VIEW.entries.map((entry) => ({ ...entry })) }),
    })
    expect(placed()).toEqual(['Bronze', 'Mithril', 'Adamant', 'Iron', 'Steel'])
    await rerender({ question: open({ ...VIEW, picks: 2 }) })
    expect(placed()).toEqual([null, null])
  })

  it('starts over from the rewind button beside Submit', async () => {
    render(Question, { question: open(), yourValue: null, onAnswer: () => {} })
    await press('Iron', ' ')
    await press('Iron', 'ArrowUp')
    expect(rewind().disabled).toBe(false)
    await fireEvent.click(rewind())
    expect(placed()).toEqual(SHOWN)
    expect(rewind().disabled).toBe(true)
    expect(rewind().nextElementSibling).toBe(submit())
  })

  it('once sent, shows our order, held, with no handles, Submit or Start over', () => {
    render(Question, { question: open(), yourValue: [1, 3, 4, 2, 0], onAnswer: () => {} })
    expect(placed()).toEqual(['Bronze', 'Iron', 'Steel', 'Adamant', 'Mithril'])
    expect(screen.queryAllByRole('button', { name: /^Move / })).toHaveLength(0)
    expect(screen.queryByRole('button', { name: 'Submit' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Start over' })).toBeNull()
  })

  it('sends the order on its own a second before time runs out', async () => {
    closingSoon()
    const onAnswer = vi.fn()
    render(Question, { question: open(), yourValue: null, onAnswer })
    await press('Bronze', ' ')
    await press('Bronze', 'ArrowUp')
    vi.advanceTimersByTime(8_999)
    expect(onAnswer).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onAnswer).toHaveBeenCalledExactlyOnceWith([1, 0, 2, 3, 4])
  })

  it('sends nothing on its own once an order is sent, or for somebody who cannot answer', () => {
    closingSoon()
    const onAnswer = vi.fn()
    render(Question, { question: open(), yourValue: [1, 3, 4, 2, 0], onAnswer })
    render(Question, { question: open(VIEW, false), yourValue: null, onAnswer })
    vi.advanceTimersByTime(20_000)
    expect(onAnswer).not.toHaveBeenCalled()
  })

  it('gives somebody who cannot answer neither numbers, handles nor Submit', () => {
    render(Question, { question: open(VIEW, false), yourValue: null, onAnswer: () => {} })
    expect(document.querySelector('.tick')).toBeNull()
    expect(screen.queryAllByRole('button', { name: /^Move / })).toHaveLength(0)
    expect(screen.queryByRole('button', { name: 'Submit' })).toBeNull()
    expect(screen.getByText('Drag into order: Weakest → Strongest')).toBeTruthy()
  })

  it('moves rows between neighbours and makes room by the nearest empty place', () => {
    expect(dropAt([0, 1, 2, 3], 0, 2)).toEqual([1, 2, 0, 3])
    expect(dropAt([0, 1, 2, 3], 3, 0)).toEqual([3, 0, 1, 2])
    expect(dropAt([0, null, null], 4, 0)).toEqual([4, 0, null])
    expect(dropAt([null, 0, 1], 4, 2)).toEqual([0, 1, 4])
    expect(dropAt([0, 1, 2], 4, 1)).toEqual([0, 4, 1])
    expect(dropAt([0, 1, 2], 4, 2)).toEqual([0, 1, 4])
    expect(stepped([null, 0, null], 3, -1, true)).toEqual([null, 0, 3])
    expect(stepped([null, 0, 3], 3, 1, true)).toEqual([null, 0, null])
    expect(stepped([null, 0, 3], 3, 1, false)).toEqual([null, 0, 3])
    expect(stepped([null, 0, 3], 0, -1, true)).toEqual([0, null, 3])
    expect(filled([null, 3, null], 5)).toEqual([0, 3, 1])
  })

  it('reveals the right order with details, and fades what we put elsewhere', () => {
    render(Question, {
      question: open(),
      reveal: REVEAL,
      yourValue: [1, 3, 4, 2, 0],
      result: { value: [1, 3, 4, 2, 0], correct: false, credit: 0.6, points: 540 },
      onAnswer: () => {},
    })
    expect(screen.getByText('You had 3 of 5 in place')).toBeTruthy()
    const order = [...document.querySelectorAll('.entries .text')].map((t) => t.textContent)
    expect(order).toEqual(['Bronze', 'Iron', 'Steel', 'Mithril', 'Adamant'])
    const state = (name: string) => (gem(name).classList.contains('faded') ? 'faded' : 'lit')
    expect(order.map((name) => state(name!))).toEqual(['lit', 'lit', 'lit', 'faded', 'faded'])
    expect(gem('Mithril').textContent).toContain('you: 5')
    expect(gem('Adamant').textContent).toContain('you: 4')
    expect(gem('Bronze').textContent).not.toContain('you')
    expect(gem('Iron').textContent).toContain('Rank 2')
    expect(screen.getByText('Weakest')).toBeTruthy()
    expect(screen.getByText('Strongest')).toBeTruthy()
    expect(screen.queryByText(/Tap in order/)).toBeNull()
  })

  it('reveals a tie under one number, and a tied entry in either tied place as in place', () => {
    const entries = [
      { text: 'Demon Slayer', rank: 1 },
      { text: 'Dragon Slayer I', rank: 2 },
      { text: "Cook's Assistant", rank: 1 },
    ]
    const view = { ...VIEW, entries: entries.map(({ text }) => ({ text })) }
    render(Question, {
      question: open(view),
      reveal: { ...view, entries, answer: [2, 0, 1] },
      yourValue: [0, 2, 1],
      result: { value: [0, 2, 1], correct: true, credit: 1, points: 1000 },
      onAnswer: () => {},
    })
    const boxes = [...document.querySelectorAll('.entries .tick')].map((t) => t.textContent)
    expect(boxes).toEqual(['1', '1', '3'])
    expect(document.querySelector('.faded')).toBeNull()
  })

  describe('with picks', () => {
    const item = gem
    const revealed = () =>
      [...document.querySelectorAll('.entries .text')].map((t) => t.textContent)

    it('starts with that many empty places over a tray of every entry, and waits for them', async () => {
      const onAnswer = vi.fn()
      render(Question, { question: open(PICKED), yourValue: null, onAnswer })
      expect(screen.getByText('Drag 3 into order: Most valuable → Least valuable')).toBeTruthy()
      expect(placed()).toEqual([null, null, null])
      expect(tray()).toEqual(ITEMS)
      expect(submit().disabled).toBe(true)
      for (const name of ['Tumeken', 'Scythe of vitur', 'Twisted bow']) {
        await press(name, ' ')
        await press(name, 'ArrowUp')
        await press(name, ' ')
      }
      expect(placed()).toEqual(['Tumeken', 'Scythe of vitur', 'Twisted bow'])
      expect(tray()).toEqual(['Lobster', 'Abyssal whip', 'Rune platebody'])
      expect(submit().disabled).toBe(false)
      for (const [name, steps] of [
        ['Scythe of vitur', 1],
        ['Twisted bow', 2],
      ] as const) {
        await press(name, ' ')
        for (let step = 0; step < steps; step += 1) await press(name, 'ArrowUp')
        await press(name, ' ')
      }
      expect(placed()).toEqual(['Twisted bow', 'Scythe of vitur', 'Tumeken'])
      await fireEvent.click(submit())
      expect(onAnswer).toHaveBeenCalledExactlyOnceWith([1, 3, 5])
    })

    it('moves a row from the tray into the last place and back from the keyboard', async () => {
      render(Question, { question: open(PICKED), yourValue: null, onAnswer: () => {} })
      await press('Lobster', ' ')
      await press('Lobster', 'ArrowUp')
      expect(placed()).toEqual([null, null, 'Lobster'])
      expect(news()).toBe('Lobster, place 3 of 3')
      expect(document.activeElement).toBe(handle('Lobster'))
      await press('Lobster', 'ArrowUp')
      expect(placed()).toEqual([null, 'Lobster', null])
      await press('Lobster', 'ArrowDown')
      await press('Lobster', 'ArrowDown')
      expect(placed()).toEqual([null, null, null])
      expect(tray()).toContain('Lobster')
      expect(news()).toBe('Lobster, with the rest')
    })

    it('pushes the rows under a filled place down, the last of them back to the tray', async () => {
      layout()
      render(Question, { question: open(PICKED), yourValue: null, onAnswer: () => {} })
      await dragTo('Lobster', 50)
      await dragTo('Twisted bow', 50)
      expect(placed()).toEqual(['Twisted bow', 'Lobster', null])
      await dragTo('Tumeken', 50)
      expect(placed()).toEqual(['Tumeken', 'Twisted bow', 'Lobster'])
      expect(submit().disabled).toBe(false)
      await dragTo('Abyssal whip', 90)
      expect(placed()).toEqual(['Tumeken', 'Abyssal whip', 'Twisted bow'])
      expect(tray()).toEqual(['Lobster', 'Scythe of vitur', 'Rune platebody'])
      await dragTo('Twisted bow', 500)
      expect(placed()).toEqual(['Tumeken', 'Abyssal whip', null])
      expect(submit().disabled).toBe(true)
    })

    it('empties the places on Start over', async () => {
      render(Question, { question: open(PICKED), yourValue: null, onAnswer: () => {} })
      await press('Lobster', ' ')
      await press('Lobster', 'ArrowUp')
      await fireEvent.click(rewind())
      expect(placed()).toEqual([null, null, null])
      expect(tray()).toEqual(ITEMS)
    })

    it('fills the empty places from the top of the tray when time runs out', async () => {
      closingSoon()
      const onAnswer = vi.fn()
      render(Question, { question: open(PICKED), yourValue: null, onAnswer })
      await press('Scythe of vitur', ' ')
      await press('Scythe of vitur', 'ArrowUp')
      await press('Scythe of vitur', 'ArrowUp')
      vi.advanceTimersByTime(9_000)
      expect(onAnswer).toHaveBeenCalledExactlyOnceWith([0, 3, 1])
    })

    it('reveals only the top ones, and says how many were in and out of place', () => {
      render(Question, {
        question: open(PICKED),
        reveal: PICKED_REVEAL,
        yourValue: [1, 5, 3],
        result: { value: [1, 5, 3], correct: false, credit: 2 / 3, points: 600 },
        onAnswer: () => {},
      })
      expect(revealed()).toEqual(['Twisted bow', 'Scythe of vitur', 'Tumeken'])
      expect(screen.getByText('You had 1 of 3 in place, 2 out of place')).toBeTruthy()
      expect(item('Scythe of vitur').textContent).toContain('you: 3')
      expect(item('Tumeken').textContent).toContain('you: 2')
      expect(screen.getByText('Most valuable')).toBeTruthy()
      expect(screen.queryByText('Least valuable')).toBeNull()
    })

    it('fades a top entry we left out, without a "you"', () => {
      render(Question, {
        question: open(PICKED),
        reveal: PICKED_REVEAL,
        yourValue: [1, 3, 0],
        result: { value: [1, 3, 0], correct: false, credit: 2 / 3, points: 600 },
        onAnswer: () => {},
      })
      expect(screen.getByText('You had 2 of 3 in place')).toBeTruthy()
      expect(item('Tumeken').classList.contains('faded')).toBe(true)
      expect(item('Tumeken').textContent).not.toContain('you')
      expect(item('Twisted bow').classList.contains('faded')).toBe(false)
    })

    it('reveals an entry tied with the last pick as well', () => {
      const tied = { ...PICKED_REVEAL, entries: PICKED_REVEAL.entries.map((e) => ({ ...e })) }
      tied.entries[2]!.rank = 3
      render(Question, {
        question: open(PICKED),
        reveal: { ...tied, answer: [1, 3, 5, 2, 4, 0] },
        yourValue: null,
        onAnswer: () => {},
      })
      expect(revealed()).toEqual(['Twisted bow', 'Scythe of vitur', 'Tumeken', 'Abyssal whip'])
      const boxes = [...document.querySelectorAll('.entries .tick')].map((t) => t.textContent)
      expect(boxes).toEqual(['1', '2', '3', '3'])
    })

    it('counts places and right picks elsewhere off the value, as the server grades', () => {
      expect(placement(PICKED_REVEAL, [1, 5, 3])).toEqual({ inPlace: 1, outOfPlace: 2 })
      expect(placement(PICKED_REVEAL, [1, 3, 0])).toEqual({ inPlace: 2, outOfPlace: 0 })
      expect(placement(PICKED_REVEAL, [0, 4, 2])).toEqual({ inPlace: 0, outOfPlace: 0 })
    })
  })

  it('numbers ties by the first place they share', () => {
    expect(placeNumbers([1, 1, 2, 3])).toEqual([1, 1, 3, 4])
    expect(placeNumbers([1, 2, 2, 2, 5])).toEqual([1, 2, 2, 2, 5])
  })
})
