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

vi.mock('../../lib/map', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../lib/map')>()
  return { ...real, tilesLoad: vi.fn(() => Promise.resolve(true)) }
})

const BOX = { min_x: 3200, max_x: 3240, min_y: 3200, max_y: 3240 }

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
  it('draws a map round’s places on a map when the switch says Map', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800)
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600)
    vi.mocked(api.getReportChoices).mockResolvedValue({
      by: 'question',
      choices: [
        { id: 'a', label: 'Where is Varrock?', places: [{ name: 'Varrock', ...BOX }] },
        { id: 'b', label: 'Where is Lumbridge?', places: [{ name: 'Lumbridge', ...BOX }] },
      ],
    })
    render(ExistingQuestions, { mode: 'mark_the_map', open: true })
    await waitFor(() => expect(rows()).toHaveLength(2))
    expect(panel().querySelector('.leaflet-container')).toBeNull()
    await fireEvent.click(screen.getByRole('radio', { name: 'Map' }))
    const names = await waitFor(() => {
      const found = [...panel().querySelectorAll('.map-name')]
      if (found.length === 0) throw new Error('no map yet')
      return found.map((tag) => tag.textContent)
    })
    expect(names).toEqual(['Varrock', 'Lumbridge'])
    expect(rows()).toEqual([])
    await fireEvent.click(screen.getByRole('radio', { name: 'List' }))
    expect(rows()).toHaveLength(2)
  })

  it('offers no map for a round without places', async () => {
    vi.mocked(api.getReportChoices).mockResolvedValue({
      by: 'question',
      choices: [{ id: 'a', label: 'Which boss drops the Abyssal whip?' }],
    })
    render(ExistingQuestions, { mode: 'bestiary', open: true })
    await waitFor(() => expect(rows()).toHaveLength(1))
    expect(screen.queryByRole('radio', { name: 'Map' })).toBeNull()
  })

  it('shows a round on screenshots by its photos, since every one asks the same', async () => {
    const label = 'Where was this photo taken?'
    vi.mocked(api.getReportChoices).mockResolvedValue({
      by: 'question',
      choices: [
        { id: 'a', label, picture: 'a1b2c3d4e5f60718.webp' },
        { id: 'b', label, picture: '0f1e2d3c4b5a6978.webp' },
      ],
    })
    render(ExistingQuestions, { mode: 'kgp_recon', open: true })
    const photos = await screen.findAllByRole('img', { name: /^Photo \d$/ })
    expect(photos.map((img) => img.getAttribute('src'))).toEqual([
      '/pictures/a1b2c3d4e5f60718.webp',
      '/pictures/0f1e2d3c4b5a6978.webp',
    ])
    expect(screen.queryByLabelText('Search the questions already in the game')).toBeNull()
  })

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
