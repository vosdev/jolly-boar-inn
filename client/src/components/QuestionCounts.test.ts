/** The question count sheet: every round's and every NPC's questions, most first. */

import { cleanup, render, screen, within } from '@testing-library/svelte'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { modeLabel } from '../lib/modes'
import { randomEventFor } from '../lib/randomEvents'
import QuestionCounts from './QuestionCounts.svelte'

afterEach(cleanup)

function rows(name: string): string[][] {
  const body = screen.getByRole('table', { name }).querySelector('tbody') as HTMLElement
  return within(body)
    .getAllByRole('row')
    .map((row) =>
      within(row)
        .getAllByRole('cell')
        .map((cell) => cell.textContent ?? ''),
    )
}

describe('QuestionCounts', () => {
  it('lists the rounds and the NPCs by their names, most questions first', () => {
    render(QuestionCounts, {
      counts: {
        modes: { bestiary: 32, pixel_hunt: 1394, odd_one_out: 34 },
        random_events: { bob: 10, reldo: 6, death: 10 },
      },
      onclose: vi.fn(),
    })
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('1,486 questions')
    expect(rows('Rounds')).toEqual([
      [modeLabel('pixel_hunt'), '1,394'],
      [modeLabel('odd_one_out'), '34'],
      [modeLabel('bestiary'), '32'],
    ])
    const [bob, death] = [randomEventFor('bob').name, randomEventFor('death').name].sort()
    expect(rows('Random events')).toEqual([
      [bob!, '10'],
      [death!, '10'],
      [randomEventFor('reldo').name, '6'],
    ])
  })

  it('leaves out a table with nothing in it', () => {
    render(QuestionCounts, {
      counts: { modes: { bestiary: 3 }, random_events: {} },
      onclose: vi.fn(),
    })
    expect(screen.queryByRole('table', { name: 'Random events' })).toBeNull()
  })
})
