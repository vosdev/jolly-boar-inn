/**
 * How to play's Try a question: a sample plays with the room's parts, reveals with the
 * host's line and the points, and never reaches the server.
 */

import { fireEvent, render, screen } from '@testing-library/svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { MODES } from '../lib/modes'
import { SAMPLES } from '../lib/samples'
import HowToPage from './HowToPage.svelte'
import timerBarSource from './TimerBar.svelte?raw'
import TryQuestion from './TryQuestion.svelte'

const sample = SAMPLES.guess_examine!
const options = sample.view.options as string[]
const lines = MODES.guess_examine!.verdict

function noop(): void {}

function shownLine(): string {
  return document.querySelector('.line')?.textContent?.trim() ?? ''
}

describe('Try a question', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('[]'))),
    )
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('is offered by each mode with a sample, and the overview', () => {
    for (const id of Object.keys(MODES)) {
      const { unmount } = render(HowToPage, {
        view: id,
        onopen: noop,
        onall: noop,
        onback: noop,
        ontry: noop,
      })
      const offered = screen.queryByRole('button', { name: 'Try a question' }) !== null
      expect(offered, id).toBe(id in SAMPLES)
      unmount()
    }
    const ontry = vi.fn()
    render(HowToPage, { view: 'overview', onopen: noop, onall: noop, onback: noop, ontry })
    void fireEvent.click(screen.getByRole('button', { name: 'Try a question' }))
    expect(ontry).toHaveBeenCalledWith('more_less')
  })

  it('reveals a right answer with the host line and the points', async () => {
    render(TryQuestion, { sample, next: 'bestiary', onnext: noop })
    await fireEvent.click(screen.getByRole('button', { name: new RegExp(options[sample.answer]!) }))
    expect(lines.right).toContain(shownLine())
    expect(document.body.textContent).toContain('+1,000')
    expect(screen.getByRole('button', { name: 'Again' })).toBeTruthy()
  })

  it('reveals a wrong answer with no points', async () => {
    render(TryQuestion, { sample, next: 'bestiary', onnext: noop })
    const wrong = options.find((_, i) => i !== sample.answer)!
    await fireEvent.click(screen.getByRole('button', { name: new RegExp(wrong) }))
    expect(lines.wrong).toContain(shownLine())
    expect(document.body.textContent).toContain('+0')
  })

  it('reveals with no points once time runs out', async () => {
    vi.useFakeTimers()
    render(TryQuestion, { sample, next: 'bestiary', onnext: noop })
    await vi.advanceTimersByTimeAsync(20_500)
    expect(lines.missed).toContain(shownLine())
    expect(document.body.textContent).toContain('No answer')
  })

  it('offers Again and the next mode', async () => {
    const onnext = vi.fn()
    render(TryQuestion, { sample, next: 'bestiary', onnext })
    await fireEvent.click(screen.getByRole('button', { name: new RegExp(options[0]!) }))
    await fireEvent.click(screen.getByRole('button', { name: 'Try Bestiary' }))
    expect(onnext).toHaveBeenCalledWith('bestiary')
    await fireEvent.click(screen.getByRole('button', { name: 'Again' }))
    expect(screen.queryByRole('button', { name: 'Again' })).toBeNull()
  })

  it('counts in no stats: nothing is sent', async () => {
    const socket = vi.fn()
    vi.stubGlobal('WebSocket', socket)
    render(TryQuestion, { sample, next: 'bestiary', onnext: noop })
    await fireEvent.click(screen.getByRole('button', { name: new RegExp(options[sample.answer]!) }))
    expect(fetch).not.toHaveBeenCalled()
    expect(socket).not.toHaveBeenCalled()
  })

  it('keeps the timer bar still with reduced motion', () => {
    // Vitest hands component styles over empty, so the rule is read from the source.
    expect(timerBarSource).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{\s*\.fill \{\s*transition: none;/,
    )
  })
})
