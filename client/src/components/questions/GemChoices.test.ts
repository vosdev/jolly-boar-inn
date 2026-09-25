/**
 * D8: the gem buttons and the reveal rule from section 2.
 *
 * What the accept criteria ask of a reveal: whichever gem is correct, it is the only one
 * not faded; our own pick, right or wrong, carries a "you"; and with no answer from us,
 * no button is drawn as pressed. There are no rings, ✓ or ✗: lit against faded is the
 * signal, and a pick fades the other options while the question is still open.
 */

import { fireEvent, render, screen } from '@testing-library/svelte'
import { createRawSnippet } from 'svelte'
import { describe, expect, it, vi } from 'vitest'

import type { OpenQuestion } from '../../lib/protocol'
import { GEMS, gemState, indexSet } from './GemButton.svelte'
import GemChoices from './GemChoices.svelte'
import Question from './Question.svelte'

const SIX = ['One', 'Two', 'Three', 'Four', 'Five', 'Six']

const label = createRawSnippet((option: () => string) => ({
  render: () => `<span>${option()}</span>`,
}))

function draw(props: {
  picked?: number | null
  answer?: number | null
  revealed?: boolean
  canAnswer?: boolean
  options?: string[]
  onAnswer?: (index: number) => void
}) {
  return render(GemChoices<string>, {
    options: props.options ?? SIX,
    picked: indexSet(props.picked ?? null),
    answer: indexSet(props.answer ?? null),
    revealed: props.revealed ?? false,
    canAnswer: props.canAnswer ?? true,
    onAnswer: props.onAnswer ?? (() => {}),
    label,
  })
}

const buttons = () => screen.getAllByRole('button')
const states = () =>
  buttons().map((b) =>
    ['idle', 'waiting', 'correct', 'faded', 'wrong'].find((s) => b.classList.contains(s)),
  )

describe('gemState', () => {
  it('has five states and no others', () => {
    const none = indexSet(null)
    const zero = indexSet(0)
    const one = indexSet(1)
    expect(gemState(0, none, none, false)).toBe('idle')
    expect(gemState(0, zero, none, false)).toBe('waiting')
    expect(gemState(1, zero, none, false)).toBe('faded')
    expect(gemState(0, zero, zero, true)).toBe('correct')
    expect(gemState(0, none, zero, true)).toBe('correct')
    expect(gemState(1, zero, zero, true)).toBe('faded')
    expect(gemState(1, one, zero, true)).toBe('wrong')
  })
})

describe('GemChoices', () => {
  it('draws the gems in value order, one per option, sapphire first', () => {
    draw({})
    expect(buttons().map((b) => GEMS.find((gem) => b.classList.contains(gem)))).toEqual([
      ...GEMS,
    ])
    draw({ options: ['Yes', 'No'] })
    const two = buttons().slice(6)
    expect(two[0]!.classList.contains('sapphire')).toBe(true)
    expect(two[1]!.classList.contains('emerald')).toBe(true)
  })

  it('answers with the position pressed', async () => {
    const onAnswer = vi.fn()
    draw({ onAnswer })
    await fireEvent.click(screen.getByText('Five'))
    expect(onAnswer).toHaveBeenCalledWith(4)
  })

  it('holds every button once answered, ours lit and every other faded', () => {
    draw({ picked: 2 })
    expect(buttons().every((b) => (b as HTMLButtonElement).disabled)).toBe(true)
    expect(states()).toEqual(['faded', 'faded', 'waiting', 'faded', 'faded', 'faded'])
    expect(buttons()[2]!.textContent).toContain('you')
    expect(buttons().map((b) => b.getAttribute('aria-pressed'))).toEqual([
      'false',
      'false',
      'true',
      'false',
      'false',
      'false',
    ])
  })

  it('draws a seventh option, over the cap, on the last gem rather than on nothing', () => {
    draw({ options: [...SIX, 'Seven'] })
    expect(buttons()[6]!.classList.contains('zenyte')).toBe(true)
  })

  const sizes = () =>
    buttons().map((b) => ['normal', 'large', 'small'].find((s) => b.classList.contains(s)))

  it('keeps every button its normal size while a pick waits', () => {
    draw({ picked: 2 })
    expect(sizes().every((size) => size === 'normal')).toBe(true)
  })

  it('draws the answer large on the reveal and the rest small, in position order', () => {
    const { container } = draw({ picked: 4, answer: 1, revealed: true })
    expect(sizes()).toEqual(['small', 'large', 'small', 'small', 'small', 'small'])
    // The DOM, and so a screen reader, keeps the options in order; CSS moves the answer.
    expect(buttons().map((b) => b.textContent?.match(/One|Two|Three|Four|Five|Six/)?.[0])).toEqual(
      SIX,
    )
    const grid = container.querySelector('.gems') as HTMLElement
    expect(grid.classList.contains('settled')).toBe(true)
    expect(grid.style.getPropertyValue('--columns')).toBe('3')
  })

  it.each([
    [2, '1'],
    [4, '3'],
    [5, '2'],
    [6, '3'],
  ])('lays %i options out under the answer in %s columns', (count, columns) => {
    const { container } = draw({ options: SIX.slice(0, count), answer: 0, revealed: true })
    const grid = container.querySelector('.gems') as HTMLElement
    expect(grid.style.getPropertyValue('--columns')).toBe(columns)
  })

  it.each(GEMS.map((gem, index) => [gem, index] as const))(
    'lights only %s when it is the answer, and fades every other',
    (_gem, answer) => {
      draw({ answer, revealed: true })
      expect(states().filter((state) => state !== 'faded')).toEqual(['correct'])
      expect(states()[answer]).toBe('correct')
      // No glyphs: lit against faded is the whole signal.
      expect(buttons().some((b) => /[✓✗]/.test(b.textContent ?? ''))).toBe(false)
    },
  )

  it('keeps our wrong pick identifiable by its "you", faded like the rest', () => {
    draw({ picked: 5, answer: 1, revealed: true })
    const ours = buttons()[5]!
    expect(ours.classList.contains('wrong')).toBe(true)
    expect(ours.textContent).toContain('you')
    expect(ours.textContent).toContain('your answer, wrong')
    expect(ours.textContent).not.toContain('✗')
    expect(screen.getAllByText('you')).toHaveLength(1)
  })

  it('keeps the "you" on a right pick, where no ✗ says it is ours', () => {
    draw({ picked: 2, answer: 2, revealed: true })
    const ours = buttons()[2]!
    expect(ours.classList.contains('correct')).toBe(true)
    expect(ours.textContent).toContain('you')
    expect(ours.getAttribute('aria-pressed')).toBe('true')
  })

  it('shows no button as pressed when we did not answer', () => {
    draw({ answer: 3, revealed: true })
    expect(buttons().every((b) => b.getAttribute('aria-pressed') === 'false')).toBe(true)
    expect(screen.queryByText('you')).toBeNull()
  })

  it('never changes a gem on reveal: the answer keeps its own', () => {
    draw({ answer: 1, revealed: true })
    expect(buttons()[1]!.classList.contains('emerald')).toBe(true)
    expect(buttons()[1]!.classList.contains('correct')).toBe(true)
  })
})

describe('from the keyboard', () => {
  // jsdom has no Tab order and no key-to-click, so this holds the buttons to what gives
  // them both in a browser: a native, enabled <button> that nothing takes out of the order.
  // The focus ring is a stylesheet rule jsdom never applies; test_themes.py holds it.
  it('makes every gem a button Tab reaches and Enter presses', async () => {
    const onAnswer = vi.fn()
    draw({ onAnswer })
    for (const button of buttons()) {
      expect(button.tagName).toBe('BUTTON')
      expect((button as HTMLButtonElement).disabled).toBe(false)
      expect(button.tabIndex).toBeGreaterThanOrEqual(0)
      button.focus()
      expect(document.activeElement).toBe(button)
    }
    await fireEvent.click(buttons()[5]!)
    expect(onAnswer).toHaveBeenCalledWith(5)
  })
})

describe('more_less on the plain buttons', () => {
  const VIEW = {
    metric: 'ge_price',
    direction: 'more',
    options: [{ subject: { name: 'Abyssal whip' } }, { subject: { name: 'Dragon bones' } }],
    as_of: '2026-09-01',
  }
  const open: OpenQuestion = {
    question_id: 'q1',
    index: 0,
    total: 10,
    type: 'more_less',
    mode: 'more_less',
    segment: { mode: 'more_less', index: 0, total: 1, start: 0, count: 10 },
    view: VIEW,
    opened_at: '2026-09-21T20:00:00Z',
    ends_at: '2026-09-21T20:00:10Z',
    you_can_answer: true,
  }
  const reveal = { ...VIEW, answer_index: 0 }

  // The ideas/IDEAS.md bug: an unanswered question drew its answer in the pressed style,
  // which read as "you chose the right one".
  it('draws no button pressed on a reveal we did not answer', () => {
    render(Question, { question: open, reveal, yourValue: null, onAnswer: () => {} })
    const whip = buttons()[0]!
    const bones = buttons()[1]!
    expect(whip.classList.contains('correct')).toBe(true)
    expect(whip.classList.contains('waiting')).toBe(false)
    expect(whip.textContent).not.toContain('you')
    expect(bones.classList.contains('faded')).toBe(true)
    expect(buttons().every((b) => b.getAttribute('aria-pressed') === 'false')).toBe(true)
  })

  it('keeps no gem on either button', () => {
    render(Question, { question: open, yourValue: null, onAnswer: () => {} })
    expect(buttons().every((b) => b.classList.contains('plain'))).toBe(true)
    expect(buttons().some((b) => GEMS.some((gem) => b.classList.contains(gem)))).toBe(false)
  })
})
