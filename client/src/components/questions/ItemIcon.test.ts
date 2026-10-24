/**
 * Item icons on The Price is Right's scroll and More or Less's buttons. The art is not
 * committed, so `lib/items` is mocked: the whip has an icon, everything else none.
 */

import { fireEvent, render, screen } from '@testing-library/svelte'
import { describe, expect, it, vi } from 'vitest'

import type { OpenQuestion } from '../../lib/protocol'
import QuestionStage from '../QuestionStage.svelte'
import ItemIcon from './ItemIcon.svelte'
import Question from './Question.svelte'

vi.mock('../../lib/items', () => ({
  itemIcon: (asset: unknown) => (asset === 'item:4151' ? '/assets/4151-abc.png' : null),
}))

const WHIP = { name: 'Abyssal whip', asset: 'item:4151' }
const BONES = { name: 'Dragon bones', asset: 'item:536' }
const ASK = 'What does it go for on the Grand Exchange?'

function open(type: string, view: Record<string, unknown>): OpenQuestion {
  return {
    question_id: 'q1',
    index: 0,
    total: 10,
    type,
    mode: type,
    segment: { mode: type, index: 0, total: 1, start: 0, count: 10 },
    view,
    opened_at: '2026-09-21T20:00:00Z',
    ends_at: '2026-09-21T20:00:15Z',
    you_can_answer: true,
    picture: null,
    random_event: null,
    answerable_at: '2026-09-21T20:00:00Z',
    answered: 0,
    of: 0,
    waiting: [],
  }
}

const price = (subject: Record<string, unknown>) => ({
  subject,
  options: [1_100_000, 1_600_000, 2_100_000, 29_000_000],
  as_of: '2026-09-20',
})

const pair = { metric: 'ge_price', direction: 'more', as_of: '2026-09-01' }
const MORE_LESS = { ...pair, options: [{ subject: WHIP }, { subject: BONES }] }
const MORE_LESS_REVEAL = {
  ...pair,
  options: [
    { subject: WHIP, value: 1_500_000 },
    { subject: BONES, value: 2_000 },
  ],
  answer_index: 0,
}

const icons = (root: ParentNode = document) =>
  [...root.querySelectorAll<HTMLElement>('.item')].map((box) => box.dataset.asset)
const onAnswer = () => {}

describe('The Price is Right’s icon', () => {
  it('is on the scroll under the question, open and revealed', () => {
    const question = open('price_is_right', price(WHIP))
    const { unmount } = render(QuestionStage, { question, yourValue: null, onAnswer })
    const paper = document.querySelector('.paper')!
    expect(icons(paper)).toEqual(['item:4151'])
    const icon = paper.querySelector('.item')!
    expect(
      screen.getByText(ASK).compareDocumentPosition(icon) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    unmount()

    const reveal = { ...price(WHIP), value: 1_600_000, answer_index: 1 }
    render(QuestionStage, { question, reveal, yourValue: null, onAnswer })
    expect(icons(document.querySelector('.paper')!)).toEqual(['item:4151'])
  })

  it('leaves no image and no empty box for an item with no file', () => {
    const { container } = render(Question, {
      question: open('price_is_right', price(BONES)),
      yourValue: null,
      onAnswer,
    })
    expect(container.querySelector('.item, .icon, img')).toBeNull()
    expect(screen.getByText('Dragon bones')).toBeTruthy()
  })
})

describe('More or Less’s icons', () => {
  it('sit above the name on a button, and an item with no file shows its name alone', () => {
    render(Question, { question: open('more_less', MORE_LESS), yourValue: null, onAnswer })
    const [whip, bones] = screen.getAllByRole('button')
    expect(icons(whip)).toEqual(['item:4151'])
    const name = screen.getByText('Abyssal whip')
    expect(
      whip!.querySelector('.item')!.compareDocumentPosition(name) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(bones!.querySelector('.item, img')).toBeNull()
  })

  it('stay on the reveal', () => {
    render(Question, {
      question: open('more_less', MORE_LESS),
      reveal: MORE_LESS_REVEAL,
      yourValue: null,
      onAnswer,
    })
    expect(icons(screen.getAllByRole('button')[0])).toEqual(['item:4151'])
  })
})

describe('ItemIcon', () => {
  it('draws pixel art at a whole number of pixels per art pixel, with hard edges', async () => {
    const { container } = render(ItemIcon, { asset: 'item:4151', size: 72 })
    const img = container.querySelector('img')!
    Object.defineProperty(img, 'naturalWidth', { value: 33 })
    Object.defineProperty(img, 'naturalHeight', { value: 30 })
    await fireEvent.load(img)
    expect(img.style.width).toBe('66px')
    expect(img.style.height).toBe('60px')
    expect(img.classList.contains('crisp')).toBe(true)
  })
})
