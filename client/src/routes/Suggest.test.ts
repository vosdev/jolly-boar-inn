/** `/suggest`: only after a game, the limit before any field, and each kind as the server takes it. */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as api from '../lib/api'
import { savePastGame } from '../lib/history'
import Suggest from './Suggest.svelte'

vi.mock('../lib/api', async (importOriginal) => {
  const real = await importOriginal<typeof import('../lib/api')>()
  return { ...real, getSuggestionAllowance: vi.fn(), sendSuggestion: vi.fn() }
})

const navigate = vi.fn()

function played(): void {
  savePastGame({ code: 'ABYSSAL', finishedAt: '2026-10-01T20:05:00Z', standings: [], youId: null })
}

async function type(label: string | RegExp, value: string): Promise<void> {
  await fireEvent.input(screen.getByLabelText(label), { target: { value } })
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
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

  it('sends an item under the player’s credit, and thanks them', async () => {
    played()
    render(Suggest, { navigate })
    await fireEvent.click(await screen.findByRole('button', { name: /A popular item/ }))
    await fireEvent.click(screen.getByRole('button', { name: 'Send to the innkeeper' }))
    expect(screen.getByText(/Required: the item’s name/)).toBeTruthy()
    expect(screen.getByText(/Required: a name to credit/)).toBeTruthy()
    expect(api.sendSuggestion).not.toHaveBeenCalled()

    await type(/Item name/, ' Abyssal whip ')
    await type('Your name', 'AFKFisher')
    await fireEvent.click(screen.getByLabelText(/Show my name to players/))
    await fireEvent.click(screen.getByRole('button', { name: 'Send to the innkeeper' }))
    expect(api.sendSuggestion).toHaveBeenCalledWith({
      kind: 'item',
      content: { name: 'Abyssal whip' },
      credit: 'AFKFisher',
      credit_shown: true,
    })
    await screen.findByRole('heading', { name: /on the innkeeper's desk/ })
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

    await type('Wiki page that proves it', 'https://oldschool.runescape.wiki/w/Barrows_Brothers')
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
    await type(/Item name/, 'Abyssal whip')
    await type('Your name', 'AFKFisher')
    vi.mocked(api.getSuggestionAllowance).mockResolvedValue({ left: 0, retry_at: null })
    await fireEvent.click(screen.getByRole('button', { name: 'Send to the innkeeper' }))
    await waitFor(() => expect(screen.getByText(/Try again later/)).toBeTruthy())
  })
})
