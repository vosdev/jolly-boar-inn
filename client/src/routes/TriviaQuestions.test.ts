/** The OSRS trivia questions page: every text sample, its answer folded away. */

import { fireEvent, render, screen } from '@testing-library/svelte'
import { describe, expect, it, vi } from 'vitest'

import { SHOWN } from '../components/ModeShowcase.svelte'
import { rulesOf } from '../lib/modeRules'
import { SAMPLES } from '../lib/samples'
import TriviaQuestions from './TriviaQuestions.svelte'

describe('TriviaQuestions', () => {
  it('shows a question for every mode with an unpictured sample, in showcase order', () => {
    render(TriviaQuestions, { props: { navigate: vi.fn() } })
    const expected = SHOWN.filter(
      (mode) => mode.id in SAMPLES && !(rulesOf(mode.id)?.pictured ?? false),
    ).map((mode) => mode.label)
    expect(expected.length).toBeGreaterThanOrEqual(15)
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(headings).toEqual(expected)
    expect(headings).not.toContain("Who's That NPC?")
  })

  it('keeps each answer behind Show answer', () => {
    const { container } = render(TriviaQuestions, { props: { navigate: vi.fn() } })
    const bestiary = [...container.querySelectorAll('li')].find(
      (li) => li.querySelector('h2')?.textContent === 'Bestiary',
    )!
    const details = bestiary.querySelector('details')!
    expect(details.open).toBe(false)
    expect(details.querySelector('summary')?.textContent).toBe('Show answer')
    expect(details.querySelector('.answer')?.textContent).toBe('35')
  })

  it("sends Try this question to the mode's How to play page through the router", async () => {
    const navigate = vi.fn()
    render(TriviaQuestions, { props: { navigate } })
    const link = screen.getAllByRole('link', { name: 'Try this question' })[0]!
    expect(link.getAttribute('href')).toBe('/how-to-play/more-or-less')
    await fireEvent.click(link)
    expect(navigate).toHaveBeenCalledWith('/how-to-play/more-or-less')
  })
})
