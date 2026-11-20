/** "Already in the game": a mode's pack questions, searchable, with one line when there are none. */

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as api from '../../lib/api'
import { ApiFailure } from '../../lib/api'
import ExistingQuestions from './ExistingQuestions.svelte'

vi.mock('../../lib/api', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../lib/api')>()
  return { ...real, getReportChoices: vi.fn() }
})

function panel(): HTMLElement {
  return screen.getByRole('group', { name: 'Already in the game' })
}

function rows(): string[] {
  return [...panel().querySelectorAll('li')].map((li) =>
    (li.textContent ?? '').replace(/\s+/g, ' ').trim(),
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(cleanup)

describe('ExistingQuestions', () => {
  it('lists the mode’s questions and narrows them by word prefix, case and accents aside', async () => {
    vi.mocked(api.getReportChoices).mockResolvedValue({
      by: 'question',
      choices: [
        { id: 'a', label: 'Which boss drops the Abyssal whip?' },
        { id: 'b', label: 'Who sells the Pickaxe in Falador?' },
        { id: 'c', label: 'What does Ahrim’s robetop protect?' },
      ],
    })
    render(ExistingQuestions, { mode: 'bestiary', open: true })
    await waitFor(() => expect(rows()).toHaveLength(3))
    expect(api.getReportChoices).toHaveBeenCalledWith('bestiary')

    const search = screen.getByLabelText('Search the questions already in the game')
    await fireEvent.input(search, { target: { value: 'ABYS wh' } })
    expect(rows()).toEqual(['Which boss drops the Abyssal whip?'])
    await fireEvent.input(search, { target: { value: 'ahrim' } })
    expect(rows()).toEqual(['What does Ahrim’s robetop protect?'])
    await fireEvent.input(search, { target: { value: 'whi' } })
    expect(rows()).toEqual(['Which boss drops the Abyssal whip?'])
    await fireEvent.input(search, { target: { value: 'hip' } })
    expect(within(panel()).getByText('None of them match.')).toBeTruthy()
  })

  it('names each random event’s NPC, in roster order, the picked one’s first', async () => {
    vi.mocked(api.getReportChoices).mockResolvedValue({
      by: 'question',
      choices: [
        { id: 'r', label: 'Which tome?', random_event: 'reldo' },
        { id: 'b', label: 'Which skill?', random_event: 'bob' },
        { id: 's', label: 'Which sandwich?', random_event: 'sandwich_lady' },
      ],
    })
    const view = render(ExistingQuestions, { mode: 'random_event', open: true })
    await waitFor(() => expect(rows()).toHaveLength(3))
    expect(rows()).toEqual([
      'Sandwich Lady Which sandwich?',
      'Evil Bob Which skill?',
      'Reldo Which tome?',
    ])
    expect(panel().querySelectorAll('li img')).toHaveLength(3)

    await view.rerender({ mode: 'random_event', npc: 'reldo', open: true })
    expect(rows()[0]).toBe('Reldo Which tome?')

    await fireEvent.input(screen.getByLabelText('Search the questions already in the game'), {
      target: { value: 'evil' },
    })
    expect(rows()).toEqual(['Evil Bob Which skill?'])
  })

  it('says in one line that a mode not built here has none, rather than an error', async () => {
    vi.mocked(api.getReportChoices).mockRejectedValue(
      new ApiFailure(422, 'bad_mode', "'prop_hunt' is not a mode with pack questions here"),
    )
    render(ExistingQuestions, { mode: 'prop_hunt', open: true })
    await within(panel()).findByText('The game has no questions here yet.')
    expect(document.querySelector('.banner')).toBeNull()
    expect(screen.queryByText(/prop_hunt/)).toBeNull()
    expect(screen.queryByRole('searchbox')).toBeNull()
  })

  it('says the same of a mode whose list is empty', async () => {
    vi.mocked(api.getReportChoices).mockResolvedValue({ by: 'question', choices: [] })
    render(ExistingQuestions, { mode: 'drop_table' })
    await within(panel()).findByText('The game has no questions here yet.')
    expect((panel() as HTMLDetailsElement).open).toBe(false)
  })
})
