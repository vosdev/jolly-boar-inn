/**
 * `ordering` on screen: tapping the entries first to last, starting over, sending the
 * order with Submit, and a reveal that lists the right order and where ours went astray.
 */

import { fireEvent, render, screen } from '@testing-library/svelte'
import { describe, expect, it, vi } from 'vitest'

import type { OpenQuestion } from '../../lib/protocol'
import { field, fields, limit } from '../../lib/questionSchema'
import { GEMS } from './GemButton.svelte'
import { viewFor } from './index'
import Question from './Question.svelte'
import TextStem from './stems/TextStem.svelte'
import Ordering, { placeNumbers, placement } from './types/Ordering.svelte'

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
  entries: SHOWN.map((text, index) => ({ text, rank: RANKS[index], detail: `Rank ${RANKS[index]}` })),
  answer: [1, 3, 4, 0, 2],
}

// The top three of six, as the server shuffles them.
const ITEMS = ['Lobster', 'Twisted bow', 'Abyssal whip', 'Scythe of vitur', 'Rune platebody', 'Tumeken']
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

const gem = (name: string) => screen.getByText(name).closest('button') as HTMLButtonElement
const submit = () => screen.getByRole('button', { name: 'Submit' }) as HTMLButtonElement
const rewind = () => screen.getByRole('button', { name: 'Start over' }) as HTMLButtonElement
const numbers = () => SHOWN.map((name) => gem(name).querySelector('.tick')?.textContent ?? null)

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

  it('says which end comes first, on a gem per shown entry', () => {
    render(Question, { question: open(), yourValue: null, onAnswer: () => {} })
    expect(screen.getByText('Tap in order: Weakest → Strongest')).toBeTruthy()
    expect(SHOWN.map((name) => [...gem(name).classList].find((c) => GEMS.includes(c as never)))).toEqual(
      GEMS.slice(0, SHOWN.length),
    )
  })

  it('numbers the entries as they are tapped, holds each, and sends the order on Submit', async () => {
    const onAnswer = vi.fn()
    render(Question, { question: open(), yourValue: null, onAnswer })
    for (const name of ['Bronze', 'Iron', 'Steel', 'Mithril']) await fireEvent.click(gem(name))
    expect(numbers()).toEqual(['4', '1', '', '2', '3'])
    expect(gem('Bronze').disabled).toBe(true)
    expect(gem('Adamant').disabled).toBe(false)
    expect(submit().disabled).toBe(true)
    // Tapping a placed entry again changes nothing; only Start over does.
    await fireEvent.click(gem('Bronze'))
    expect(numbers()).toEqual(['4', '1', '', '2', '3'])
    await fireEvent.click(gem('Adamant'))
    expect(document.querySelector('.faded')).toBeNull()
    expect(onAnswer).not.toHaveBeenCalled()
    await fireEvent.click(submit())
    expect(onAnswer).toHaveBeenCalledExactlyOnceWith([1, 3, 4, 0, 2])
  })

  it('starts over from the rewind button beside Submit', async () => {
    render(Question, { question: open(), yourValue: null, onAnswer: () => {} })
    expect(rewind().disabled).toBe(true)
    await fireEvent.click(gem('Steel'))
    await fireEvent.click(gem('Iron'))
    await fireEvent.click(rewind())
    expect(numbers()).toEqual(['', '', '', '', ''])
    expect(SHOWN.every((name) => !gem(name).disabled)).toBe(true)
    await fireEvent.click(gem('Iron'))
    expect(numbers()).toEqual(['', '', '', '1', ''])
    expect(rewind().nextElementSibling).toBe(submit())
  })

  it('once sent, shows our numbers, held, with neither Submit nor Start over', () => {
    render(Question, { question: open(), yourValue: [1, 3, 4, 2, 0], onAnswer: () => {} })
    expect(numbers()).toEqual(['5', '1', '4', '2', '3'])
    expect(SHOWN.every((name) => gem(name).disabled)).toBe(true)
    expect(screen.queryByRole('button', { name: 'Submit' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Start over' })).toBeNull()
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

  it('gives somebody who cannot answer neither numbers nor Submit', () => {
    render(Question, { question: open(VIEW, false), yourValue: null, onAnswer: () => {} })
    expect(document.querySelector('.tick')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Submit' })).toBeNull()
    expect(screen.getByText('Tap in order: Weakest → Strongest')).toBeTruthy()
  })

  describe('with picks', () => {
    const item = (name: string) => screen.getByText(name).closest('button') as HTMLButtonElement
    const revealed = () => [...document.querySelectorAll('.entries .text')].map((t) => t.textContent)

    it('asks for that many and holds the rest once they are tapped', async () => {
      const onAnswer = vi.fn()
      render(Question, { question: open(PICKED), yourValue: null, onAnswer })
      expect(screen.getByText('Tap 3 in order: Most valuable → Least valuable')).toBeTruthy()
      for (const name of ['Scythe of vitur', 'Twisted bow']) await fireEvent.click(item(name))
      expect(submit().disabled).toBe(true)
      expect(item('Lobster').disabled).toBe(false)
      await fireEvent.click(item('Tumeken'))
      expect(ITEMS.map((name) => item(name).disabled)).toEqual([true, true, true, true, true, true])
      await fireEvent.click(item('Lobster'))
      expect(item('Lobster').querySelector('.tick')?.textContent).toBe('')
      await fireEvent.click(submit())
      expect(onAnswer).toHaveBeenCalledExactlyOnceWith([3, 1, 5])
    })

    it('frees the held entries on Start over', async () => {
      render(Question, { question: open(PICKED), yourValue: null, onAnswer: () => {} })
      for (const name of ['Lobster', 'Twisted bow', 'Tumeken']) await fireEvent.click(item(name))
      await fireEvent.click(rewind())
      expect(ITEMS.every((name) => !item(name).disabled)).toBe(true)
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
