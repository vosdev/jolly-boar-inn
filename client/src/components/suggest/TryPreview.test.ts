/** Trying a question being written: the server's view, an answer graded, and its reveal. */

import { cleanup, fireEvent, render, screen } from '@testing-library/svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as api from '../../lib/api'
import { questionPreview, type QuestionContent, type Trial } from '../../lib/suggestions'
import TryPreview from './TryPreview.svelte'

vi.mock('../../lib/api', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../lib/api')>()
  return { ...real, tryQuestion: vi.fn() }
})

const CONTENT: QuestionContent = {
  type: 'multiple_choice',
  mode: 'bestiary',
  payload: {
    prompt: 'Which boss drops the Tanzanite fang?',
    options: ['Zulrah', 'Vorkath', 'Jad'],
    answer_index: 0,
  },
}
// The server's shuffle, which an answer is a position in.
const VIEW = {
  prompt: 'Which boss drops the Tanzanite fang?',
  options: ['Jad', 'Zulrah', 'Vorkath'],
}
const TRIAL: Trial = { view: VIEW, reveal: { ...VIEW, answer_index: 1 }, result: null }

function show(content: QuestionContent = CONTENT, answerable = true) {
  return render(TryPreview, { content, question: questionPreview(content), answerable })
}

const options = () =>
  screen
    .getAllByRole('button')
    .map((button) => button.textContent?.trim())
    .filter((text) => text !== '')

const revealSide = () => screen.getByRole('radio', { name: 'Reveal' }) as HTMLInputElement

async function settle(): Promise<void> {
  await vi.advanceTimersByTimeAsync(1000)
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.mocked(api.tryQuestion).mockImplementation(async (_content, value = null) =>
    value === null
      ? TRIAL
      : {
          ...TRIAL,
          result: { value, correct: value === 1, credit: 0, points: value === 1 ? 1000 : 0 },
        },
  )
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('TryPreview', () => {
  it('cannot show the reveal until the server has the question', async () => {
    show()
    expect(revealSide().matches(':disabled')).toBe(true)
    await settle()
    expect(revealSide().matches(':disabled')).toBe(false)
  })

  it('shows the options in the server’s order once it has them', async () => {
    show()
    await settle()
    expect(options().filter((text) => ['Jad', 'Zulrah', 'Vorkath'].includes(text ?? ''))).toEqual([
      'Jad',
      'Zulrah',
      'Vorkath',
    ])
  })

  it('grades an answer and reveals it with its points', async () => {
    show()
    await settle()
    await fireEvent.click(screen.getByRole('button', { name: /Zulrah/ }))
    await settle()
    expect(api.tryQuestion).toHaveBeenLastCalledWith(CONTENT, 1)
    expect(revealSide().checked).toBe(true)
    expect(screen.getByText('+1,000')).toBeTruthy()
  })

  it('reveals with no answer when none was given', async () => {
    show()
    await settle()
    await fireEvent.click(revealSide())
    expect(screen.getByText('No answer · +0')).toBeTruthy()
  })

  it('drops the answer and goes back to the question when the question changes', async () => {
    const { rerender } = show()
    await settle()
    await fireEvent.click(screen.getByRole('button', { name: /Zulrah/ }))
    await settle()
    const changed = { ...CONTENT, payload: { ...CONTENT.payload, prompt: 'Which boss?' } }
    await rerender({ content: changed, question: questionPreview(changed), answerable: true })
    expect(revealSide().checked).toBe(false)
    expect(revealSide().matches(':disabled')).toBe(true)
    expect(screen.queryByText('+1,000')).toBeNull()
  })

  it('takes no answer to a question nobody can answer yet', async () => {
    show(CONTENT, false)
    await settle()
    await fireEvent.click(screen.getByRole('button', { name: /Zulrah/ }))
    await settle()
    expect(api.tryQuestion).toHaveBeenCalledTimes(1)
    expect(revealSide().checked).toBe(false)
  })
})
