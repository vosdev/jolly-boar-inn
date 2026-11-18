/**
 * `number_slider` on screen: the prompt, then a linear or log slider between two numbers,
 * then, after close, the answer, your guess and everyone's.
 */

import { fireEvent, render, screen } from '@testing-library/svelte'
import { describe, expect, it, vi } from 'vitest'

import type { OpenQuestion } from '../../lib/protocol'
import { viewFor } from './index'
import Question from './Question.svelte'
import TextStem from './stems/TextStem.svelte'
import NumberSlider from './types/NumberSlider.svelte'

const LINEAR = {
  prompt: 'What Mining level do you need to mine runite ore?',
  unit: 'Mining level',
  min: 1,
  max: 99,
  scale: 'linear',
}
const LOG = { prompt: 'How many Hitpoints?', min: 100, max: 10_000, scale: 'log' }

function open(view: Record<string, unknown> = LINEAR): OpenQuestion {
  return {
    question_id: 'q1',
    index: 0,
    total: 10,
    type: 'number_slider',
    mode: 'custom',
    segment: { mode: 'custom', index: 0, total: 1, start: 0, count: 10 },
    view,
    opened_at: '2026-10-21T20:00:00Z',
    ends_at: '2026-10-21T20:00:15Z',
    you_can_answer: true,
    picture: null,
    random_event: null,
    answerable_at: '2026-10-21T20:00:00Z',
    answered: 0,
    of: 0,
    waiting: [],
    item_used: false,
    removed: [],
  }
}

const slider = () => screen.getByRole('slider')
const now = () => Number(slider().getAttribute('aria-valuenow'))
const key = (k: string) => fireEvent.keyDown(slider(), { key: k })

describe('number_slider', () => {
  it('is drawn by the text stem over its own view', () => {
    expect(viewFor('number_slider', 'custom')).toEqual({ stem: TextStem, view: NumberSlider })
  })

  it('starts in the middle and shows the ends, the chosen number and its unit', () => {
    render(Question, { question: open(), yourValue: null, onAnswer: () => {} })
    expect(now()).toBe(50)
    expect(slider().getAttribute('aria-valuetext')).toBe('50 Mining level')
    expect(screen.getByText('1')).toBeTruthy()
    expect(screen.getByText('99')).toBeTruthy()
    expect(screen.getByText('Mining level')).toBeTruthy()
  })

  it('steps a linear track by one and pages by a twentieth of it', async () => {
    render(Question, { question: open(), yourValue: null, onAnswer: () => {} })
    await key('ArrowRight')
    expect(now()).toBe(51)
    await key('PageUp')
    expect(now()).toBe(56)
    await key('PageDown')
    await key('ArrowLeft')
    await key('ArrowDown')
    expect(now()).toBe(49)
    await key('End')
    expect(now()).toBe(99)
  })

  it('snaps a log track to three figures', async () => {
    render(Question, { question: open(LOG), yourValue: null, onAnswer: () => {} })
    expect(now()).toBe(1000)
    await key('ArrowRight')
    expect(now()).toBe(1010)
    await key('PageUp')
    expect(now()).toBe(1110)
  })

  it('sends the chosen number and locks once sent', async () => {
    const onAnswer = vi.fn()
    const sending = render(Question, { question: open(), yourValue: null, onAnswer })
    await key('ArrowUp')
    await fireEvent.click(screen.getByRole('button', { name: 'Submit' }))
    expect(onAnswer).toHaveBeenCalledWith(51)
    sending.unmount()
    render(Question, { question: open(), yourValue: 70, onAnswer })
    expect(slider().getAttribute('aria-disabled')).toBe('true')
    expect(now()).toBe(70)
    expect(screen.queryByRole('button', { name: 'Submit' })).toBeNull()
  })

  it('marks the answer, your guess and everyone else’s on the reveal', () => {
    const { container } = render(NumberSlider, {
      data: { ...LINEAR, answer: 85 },
      revealed: true,
      yourValue: 80,
      canAnswer: true,
      onAnswer: () => {},
      results: {
        a: {
          value: 80,
          correct: false,
          credit: 0.8,
          points: 640,
          item_points: 0,
          item: null,
          by_book: false,
        },
        b: {
          value: 20,
          correct: false,
          credit: 0,
          points: 0,
          item_points: 0,
          item: null,
          by_book: false,
        },
      },
    })
    expect(container.querySelector('.mark.answer')?.getAttribute('data-value')).toBe('85')
    expect(container.querySelector('.mark.yours')?.getAttribute('data-value')).toBe('80')
    expect(container.querySelectorAll('.mark.tick')).toHaveLength(2)
    expect(container.textContent).toContain('off by 5 Mining level')
  })

  it('shows no slider while an editor’s ends are not a range yet', () => {
    render(NumberSlider, {
      data: { prompt: 'How many?', min: 10, scale: 'linear' },
      revealed: false,
      yourValue: null,
      canAnswer: true,
      onAnswer: () => {},
    })
    expect(screen.queryByRole('slider')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Submit' })).toBeNull()
  })
})
