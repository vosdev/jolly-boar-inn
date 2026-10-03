/**
 * `pick_all_that_apply` on screen: ticking options in place, sending them with Submit, and
 * a reveal that lights every right option and marks each of ours.
 */

import { fireEvent, render, screen } from '@testing-library/svelte'
import { describe, expect, it, vi } from 'vitest'

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
  }
}

const gem = (name: string) => screen.getByText(name).closest('button') as HTMLButtonElement
const submit = () => screen.getByRole('button', { name: 'Submit' }) as HTMLButtonElement
const ticked = () => OPTIONS.map((name) => gem(name).getAttribute('aria-pressed'))

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

  it('ticks and unticks in place, fading nothing, and sends the ticks on Submit', async () => {
    const onAnswer = vi.fn()
    render(Question, { question: open(), yourValue: null, onAnswer })
    expect(submit().disabled).toBe(true)
    await fireEvent.click(gem('Venenatis'))
    await fireEvent.click(gem('Kalphite Queen'))
    await fireEvent.click(gem('Sarachnis'))
    await fireEvent.click(gem('Kalphite Queen'))
    expect(ticked()).toEqual(['false', 'true', 'false', 'true'])
    expect(document.querySelectorAll('.tick.checked')).toHaveLength(2)
    expect(document.querySelector('.faded')).toBeNull()
    expect(onAnswer).not.toHaveBeenCalled()
    await fireEvent.click(submit())
    expect(onAnswer).toHaveBeenCalledExactlyOnceWith([1, 3])
  })

  it('with picks, holds the rest once that many are ticked and submits only then', async () => {
    const onAnswer = vi.fn()
    render(Question, { question: open({ ...VIEW, picks: 2 }), yourValue: null, onAnswer })
    await fireEvent.click(gem('Sarachnis'))
    expect(submit().disabled).toBe(true)
    await fireEvent.click(gem('Scorpia'))
    expect(submit().disabled).toBe(false)
    expect(gem('Kalphite Queen').disabled).toBe(true)
    expect(gem('Scorpia').disabled).toBe(false)
    await fireEvent.click(gem('Scorpia'))
    expect(gem('Kalphite Queen').disabled).toBe(false)
    expect(submit().disabled).toBe(true)
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

  it('gives somebody who cannot answer neither boxes nor Submit', () => {
    render(Question, { question: open(VIEW, false), yourValue: null, onAnswer: () => {} })
    expect(document.querySelector('.tick')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Submit' })).toBeNull()
  })
})
