/** `/suggest`: only after a game, the limit before any field, and each kind as the server takes it. */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as api from '../lib/api'
import { savePastGame } from '../lib/history'
import { clearVocabCache } from '../lib/vocab'
import Suggest from './Suggest.svelte'

vi.mock('../lib/api', async (importOriginal) => {
  const real = await importOriginal<typeof import('../lib/api')>()
  return { ...real, getSuggestionAllowance: vi.fn(), sendSuggestion: vi.fn(), getVocab: vi.fn() }
})

const navigate = vi.fn()

function played(): void {
  savePastGame({ code: 'ABYSSAL', finishedAt: '2026-10-01T20:05:00Z', standings: [], youId: null })
}

async function type(label: string | RegExp, value: string): Promise<void> {
  await fireEvent.input(screen.getByLabelText(label), { target: { value } })
}

const ROSTER = [
  { id: 4151, name: 'Abyssal whip' },
  { id: 13263, name: 'Abyssal bludgeon' },
  { id: 11802, name: 'Armadyl godsword' },
]

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  clearVocabCache()
  vi.mocked(api.getVocab).mockResolvedValue({ vocab: 'items', version: 'v', entries: ROSTER })
  vi.mocked(api.getSuggestionAllowance).mockResolvedValue({ left: 10, retry_at: null })
  vi.mocked(api.sendSuggestion).mockResolvedValue({ id: 'x' })
})

afterEach(cleanup)

describe('Suggest', () => {
  it('asks for a game first, and asks the server nothing', () => {
    render(Suggest, { navigate })
    expect(screen.getByText(/Play a game first/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /An examine line/ })).toBeNull()
    expect(api.getSuggestionAllowance).not.toHaveBeenCalled()
  })

  it('says the limit is reached before showing a single field', async () => {
    played()
    const retry = new Date(Date.now() + 22 * 60_000 + 5_000).toISOString()
    vi.mocked(api.getSuggestionAllowance).mockResolvedValue({ left: 0, retry_at: retry })
    render(Suggest, { navigate })
    await screen.findByText(/Try again in 23 minutes/)
    expect(screen.queryByRole('button', { name: /An examine line/ })).toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('sends an item under the player’s credit, never shown, and thanks them', async () => {
    played()
    render(Suggest, { navigate })
    await fireEvent.click(await screen.findByRole('button', { name: /A popular item/ }))
    await fireEvent.click(screen.getByRole('button', { name: 'Send to the innkeeper' }))
    expect(screen.getByText(/Required: the item’s name/)).toBeTruthy()
    expect(screen.getByText(/Required: a name to credit/)).toBeTruthy()
    expect(api.sendSuggestion).not.toHaveBeenCalled()

    const shown = screen.getByLabelText(/Show my name to players/) as HTMLInputElement
    expect(shown.disabled).toBe(true)
    expect(shown.checked).toBe(false)
    expect(screen.getByText(/do not support displaying the author of a question/)).toBeTruthy()

    await type(/Item name/, ' Ancient mace ')
    await type('Your name', 'AFKFisher')
    await fireEvent.click(screen.getByRole('button', { name: 'Send to the innkeeper' }))
    expect(api.sendSuggestion).toHaveBeenCalledWith({
      kind: 'item',
      content: { name: 'Ancient mace' },
      credit: 'AFKFisher',
      credit_shown: false,
    })
    await screen.findByRole('heading', { name: /on the innkeeper's desk/ })
  })

  it('lists the items already in the game, searchable, and refuses one of them', async () => {
    played()
    render(Suggest, { navigate })
    await fireEvent.click(await screen.findByRole('button', { name: /A popular item/ }))
    const roster = screen.getByRole('region', { name: 'Already in the game' })
    await waitFor(() => expect(roster.querySelectorAll('li')).toHaveLength(3))
    await fireEvent.input(screen.getByLabelText('Search the items already in the game'), {
      target: { value: 'abys' },
    })
    const listed = [...roster.querySelectorAll('li')].map((li) => li.textContent)
    expect(listed).toEqual(['Abyssal bludgeon', 'Abyssal whip'])

    await type(/Item name/, 'abyssal WHIP ')
    await type('Your name', 'AFKFisher')
    await fireEvent.click(screen.getByRole('button', { name: 'Send to the innkeeper' }))
    expect(screen.getByText('Already in the game.')).toBeTruthy()
    expect(api.sendSuggestion).not.toHaveBeenCalled()
  })

  it('previews an examine without the list to answer from', async () => {
    played()
    render(Suggest, { navigate })
    await fireEvent.click(await screen.findByRole('button', { name: /An examine line/ }))
    await type(/The examine text/, 'Yuck, I don’t like cabbage.')
    const preview = screen.getByRole('region', { name: 'Preview' })
    expect(preview.textContent).toContain('Yuck, I don’t like cabbage.')
    expect(preview.querySelector('[role="combobox"], input')).toBeNull()
    expect(api.getVocab).not.toHaveBeenCalled()
  })

  it('writes a round’s question with no NPC, one type and its wiki page', async () => {
    played()
    render(Suggest, { navigate })
    await fireEvent.click(await screen.findByRole('button', { name: /Odd One Out/ }))
    expect(screen.queryByLabelText('Who asks it')).toBeNull()
    expect(screen.queryByRole('group', { name: 'Type' })).toBeNull()
    await type('Question', 'Which of these is not a Barrows brother?')
    await type('Answer 1', 'Dharok')
    await type('Answer 2', 'Hazelmere')
    await fireEvent.click(screen.getByLabelText('Answer 2 is right'))
    await type('Your name', 'AFKFisher')
    await fireEvent.click(screen.getByRole('button', { name: 'Send to the innkeeper' }))
    expect(screen.getByText(/Required: the page you checked it on/)).toBeTruthy()
    expect(api.sendSuggestion).not.toHaveBeenCalled()

    await type('Relevant Wiki page', 'https://oldschool.runescape.wiki/w/Barrows_Brothers')
    await fireEvent.click(screen.getByRole('button', { name: 'Send to the innkeeper' }))
    expect(api.sendSuggestion).toHaveBeenCalledWith({
      kind: 'question',
      content: {
        type: 'multiple_choice',
        payload: {
          prompt: 'Which of these is not a Barrows brother?',
          options: ['Dharok', 'Hazelmere'],
          answer_index: 1,
        },
        mode: 'odd_one_out',
        wiki: 'https://oldschool.runescape.wiki/w/Barrows_Brothers',
      },
      credit: 'AFKFisher',
      credit_shown: false,
    })
  })

  it('writes a Sort It Out order from entries and tie boxes, and sends ranks', async () => {
    played()
    render(Suggest, { navigate })
    const card = await screen.findByRole('button', { name: /Sort It Out/ })
    expect(card.textContent).toContain('Something worth putting in order.')
    await fireEvent.click(card)
    expect(screen.queryByRole('group', { name: 'Type' })).toBeNull()
    expect(screen.queryByLabelText('Who asks it')).toBeNull()
    await fireEvent.click(screen.getByRole('button', { name: 'Send to the innkeeper' }))
    expect(screen.getAllByText('Can’t be empty.').length).toBeGreaterThan(0)
    expect(api.sendSuggestion).not.toHaveBeenCalled()

    await type('What are they sorted by?', 'Sort these gems by the level that cuts them.')
    await type('First end', 'Lowest')
    await type('Last end', 'Highest')
    await type('Entry 1', 'Sapphire')
    await type('Detail of entry 1', 'Level 20')
    await type('Entry 2', 'Opal')
    await type('Entry 3', 'Jade')
    await fireEvent.click(screen.getAllByLabelText('Tied with the one above')[0]!)
    await fireEvent.click(screen.getByRole('button', { name: 'Add an entry' }))
    await type('Entry 4', 'Emerald')
    await fireEvent.change(screen.getByLabelText('Players order'), { target: { value: '3' } })
    await type('Relevant Wiki page', 'https://oldschool.runescape.wiki/w/Crafting')
    await type('Your name', 'AFKFisher')
    await fireEvent.click(screen.getByRole('button', { name: 'Send to the innkeeper' }))
    expect(api.sendSuggestion).toHaveBeenCalledWith({
      kind: 'question',
      content: {
        type: 'ordering',
        payload: {
          prompt: 'Sort these gems by the level that cuts them.',
          ends: ['Lowest', 'Highest'],
          entries: [
            { text: 'Sapphire', rank: 1, detail: 'Level 20' },
            { text: 'Opal', rank: 1 },
            { text: 'Jade', rank: 2 },
            { text: 'Emerald', rank: 3 },
          ],
          answer: [0, 1, 2, 3],
          picks: 3,
        },
        mode: 'sort_it_out',
        wiki: 'https://oldschool.runescape.wiki/w/Crafting',
      },
      credit: 'AFKFisher',
      credit_shown: false,
    })
  })

  it('keeps the entries between three and six', async () => {
    played()
    render(Suggest, { navigate })
    await fireEvent.click(await screen.findByRole('button', { name: /Sort It Out/ }))
    expect(screen.getByRole('button', { name: 'Remove entry 1' }).hasAttribute('disabled')).toBe(true)
    for (let i = 0; i < 3; i += 1) {
      await fireEvent.click(screen.getByRole('button', { name: 'Add an entry' }))
    }
    expect(screen.getByRole('button', { name: 'Add an entry' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByLabelText('Entry 6')).toBeTruthy()
    expect(screen.queryByLabelText('Entry 7')).toBeNull()
  })

  it('makes an NPC’s question name its NPC', async () => {
    played()
    render(Suggest, { navigate })
    await fireEvent.click(await screen.findByRole('button', { name: /A random event question/ }))
    const npc = screen.getByLabelText('Who asks it') as HTMLSelectElement
    expect([...npc.options].some((option) => option.textContent === 'Random')).toBe(false)
    await fireEvent.click(screen.getByRole('button', { name: 'Send to the innkeeper' }))
    expect(screen.getByText('Pick who asks it.')).toBeTruthy()
  })

  it('shows the limit when the server refuses the send for it', async () => {
    played()
    vi.mocked(api.sendSuggestion).mockRejectedValue(
      new api.ApiFailure(429, 'rate_limited', 'too many suggestions'),
    )
    render(Suggest, { navigate })
    await fireEvent.click(await screen.findByRole('button', { name: /A popular item/ }))
    await type(/Item name/, 'Ancient mace')
    await type('Your name', 'AFKFisher')
    vi.mocked(api.getSuggestionAllowance).mockResolvedValue({ left: 0, retry_at: null })
    await fireEvent.click(screen.getByRole('button', { name: 'Send to the innkeeper' }))
    await waitFor(() => expect(screen.getByText(/Try again later/)).toBeTruthy())
  })
})
