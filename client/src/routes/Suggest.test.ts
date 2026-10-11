/** `/suggest`: only after a game, the limit before any field, and each kind as the server takes it. */

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte'
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
    expect(screen.queryByRole('group', { name: 'How players answer' })).toBeNull()
    await type('Question', 'Which of these is not a Barrows brother?')
    await type('Answer 1', 'Dharok')
    await type('Answer 2', 'Hazelmere')
    await fireEvent.click(screen.getByLabelText('Answer 2 is right'))
    await type('Your name', 'AFKFisher')
    await fireEvent.click(screen.getByRole('button', { name: 'Send to the innkeeper' }))
    expect(screen.getByText(/Required: the wiki page you checked it on, or another https link/)).toBeTruthy()
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

  it('lets a Who Said That? carry its quote, and be sent with a non-wiki source', async () => {
    played()
    render(Suggest, { navigate })
    await fireEvent.click(await screen.findByRole('button', { name: /Who Said That/ }))
    await type('Question', 'Who said this?')
    await type(/The quotation/, 'Never gonna give you up')
    const preview = screen.getByRole('region', { name: 'Preview' })
    expect(preview.querySelector('blockquote')?.textContent).toBe('Never gonna give you up')
    await type('Answer 1', 'Rick')
    await type('Answer 2', 'Zezima')
    await type('Your name', 'AFKFisher')
    await fireEvent.click(screen.getByRole('button', { name: 'Send to the innkeeper' }))
    expect(screen.getByText(/or another https link/)).toBeTruthy()
    expect(api.sendSuggestion).not.toHaveBeenCalled()

    await type(/Another source/, 'http://example.com/clip')
    await fireEvent.click(screen.getByRole('button', { name: 'Send to the innkeeper' }))
    expect(screen.getByText('A link starting https://.')).toBeTruthy()
    expect(api.sendSuggestion).not.toHaveBeenCalled()

    await type(/Another source/, ' https://www.youtube.com/watch?v=dQw4w9WgXcQ ')
    await fireEvent.click(screen.getByRole('button', { name: 'Send to the innkeeper' }))
    expect(api.sendSuggestion).toHaveBeenCalledWith({
      kind: 'question',
      content: {
        type: 'multiple_choice',
        payload: {
          prompt: 'Who said this?',
          quote: 'Never gonna give you up',
          options: ['Rick', 'Zezima'],
          answer_index: 0,
        },
        mode: 'who_said_that',
        source_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      },
      credit: 'AFKFisher',
      credit_shown: false,
    })
  })

  it('offers a quotation only to the rounds that show one', async () => {
    played()
    render(Suggest, { navigate })
    await fireEvent.click(await screen.findByRole('button', { name: /Bestiary/ }))
    expect(screen.queryByLabelText(/The quotation/)).toBeNull()
    expect(screen.getByLabelText('Another source, if the wiki can’t show it')).toBeTruthy()
  })

  it('offers an intro to an NPC’s question, previews it and sends it, and no picture', async () => {
    played()
    render(Suggest, { navigate })
    await fireEvent.click(await screen.findByRole('button', { name: /A random event question/ }))
    expect(screen.queryByLabelText(/^Picture/)).toBeNull()
    await fireEvent.click(screen.getByRole('radio', { name: 'Evil Bob' }))
    await type(/^Intro/, 'Pssst, adventurer.')
    await type('Question', 'Which of these is not a Barrows brother?')
    await type('Answer 1', 'Dharok')
    await type('Answer 2', 'Hazelmere')
    await fireEvent.click(screen.getByLabelText('Answer 2 is right'))
    await type('Relevant Wiki page', 'https://oldschool.runescape.wiki/w/Barrows_Brothers')
    await type('Your name', 'AFKFisher')
    expect(screen.getByText('Pssst, adventurer.', { selector: '.intro' })).toBeTruthy()
    await fireEvent.click(screen.getByRole('button', { name: 'Send to the innkeeper' }))
    const sent = vi.mocked(api.sendSuggestion).mock.calls[0]?.[0] as { content: { payload: object } }
    expect(sent.content.payload).toMatchObject({ intro: 'Pssst, adventurer.' })
  })

  it('offers no intro or picture to a round’s question', async () => {
    played()
    render(Suggest, { navigate })
    await fireEvent.click(await screen.findByRole('button', { name: /Drop Table/ }))
    expect(screen.queryByLabelText(/^Intro/)).toBeNull()
    expect(screen.queryByLabelText(/^Picture/)).toBeNull()
  })

  it('sends both sources when both are given', async () => {
    played()
    render(Suggest, { navigate })
    await fireEvent.click(await screen.findByRole('button', { name: /Know Your Content Creator/ }))
    expect(screen.getByLabelText(/The quotation/)).toBeTruthy()
    await type('Question', 'Which game did they stream first?')
    await type('Answer 1', 'RuneScape')
    await type('Answer 2', 'Minecraft')
    await type('Relevant Wiki page', 'https://oldschool.runescape.wiki/w/Zezima')
    await type(/Another source/, 'https://example.com/clip')
    await type('Your name', 'AFKFisher')
    await fireEvent.click(screen.getByRole('button', { name: 'Send to the innkeeper' }))
    const sent = vi.mocked(api.sendSuggestion).mock.calls[0]![0].content
    expect(sent).toMatchObject({
      wiki: 'https://oldschool.runescape.wiki/w/Zezima',
      source_url: 'https://example.com/clip',
    })
    expect((sent as { payload: object }).payload).not.toHaveProperty('quote')
  })

  it('writes a Sort It Out order from entries and tie boxes, and sends ranks', async () => {
    played()
    render(Suggest, { navigate })
    const card = await screen.findByRole('button', { name: /Sort It Out/ })
    expect(card.textContent).toContain('Something worth putting in order.')
    await fireEvent.click(card)
    expect(screen.queryByRole('group', { name: 'How players answer' })).toBeNull()
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

  it('writes a Release Order with a date on every entry, and sends it as an ordering', async () => {
    played()
    render(Suggest, { navigate })
    const card = await screen.findByRole('button', { name: /Release Order/ })
    expect(card.textContent).toContain('Something worth putting in release order.')
    await fireEvent.click(card)
    expect(screen.queryByRole('group', { name: 'How players answer' })).toBeNull()
    expect(screen.queryByLabelText('Who asks it')).toBeNull()
    expect(screen.getByLabelText('First end').getAttribute('placeholder')).toBe('Oldest')

    await type('What are they put in order of?', 'Put these quests in the order they came out.')
    await type('First end', 'Oldest')
    await type('Last end', 'Newest')
    await type('Entry 1', 'Cook’s Assistant')
    await type('Detail of entry 1', '4 January 2001')
    await type('Entry 2', 'Sheep Shearer')
    await type('Detail of entry 2', '4 January 2001')
    await type('Entry 3', 'Dragon Slayer')
    await fireEvent.click(screen.getAllByLabelText('Tied with the one above')[0]!)
    await type('Relevant Wiki page', 'https://oldschool.runescape.wiki/w/Update:Quests')
    await type('Your name', 'AFKFisher')
    await fireEvent.click(screen.getByRole('button', { name: 'Send to the innkeeper' }))
    expect(screen.getByText('Required: the date it came out.')).toBeTruthy()
    expect(api.sendSuggestion).not.toHaveBeenCalled()

    await type('Detail of entry 3', '4 January 2001')
    await fireEvent.click(screen.getByRole('button', { name: 'Send to the innkeeper' }))
    expect(api.sendSuggestion).toHaveBeenCalledWith({
      kind: 'question',
      content: {
        type: 'ordering',
        payload: {
          prompt: 'Put these quests in the order they came out.',
          ends: ['Oldest', 'Newest'],
          entries: [
            { text: 'Cook’s Assistant', rank: 1, detail: '4 January 2001' },
            { text: 'Sheep Shearer', rank: 1, detail: '4 January 2001' },
            { text: 'Dragon Slayer', rank: 2, detail: '4 January 2001' },
          ],
          answer: [0, 1, 2],
        },
        mode: 'release_order',
        wiki: 'https://oldschool.runescape.wiki/w/Update:Quests',
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

  it('writes a Drop Table answer to type, with the typos it allows', async () => {
    played()
    render(Suggest, { navigate })
    await fireEvent.click(await screen.findByRole('button', { name: /Drop Table/ }))
    await fireEvent.click(screen.getByLabelText('Type the answer'))
    await type('Question', 'Which monster drops the Abyssal whip?')
    await type('Accepted answer 1', 'Abyssal demon')
    await fireEvent.click(within(screen.getByRole('group', { name: 'Typos allowed' })).getByLabelText('2'))
    await type('Relevant Wiki page', 'https://oldschool.runescape.wiki/w/Abyssal_demon')
    await type('Your name', 'AFKFisher')
    await fireEvent.click(screen.getByRole('button', { name: 'Send to the innkeeper' }))
    expect(vi.mocked(api.sendSuggestion).mock.calls[0]![0].content).toMatchObject({
      type: 'free_text',
      mode: 'drop_table',
      payload: { prompt: 'Which monster drops the Abyssal whip?', accepted: ['Abyssal demon'], max_distance: 2 },
    })
  })

  it('swaps Bestiary’s form between asking and sorting from one type picker', async () => {
    played()
    render(Suggest, { navigate })
    await fireEvent.click(await screen.findByRole('button', { name: /Bestiary/ }))
    const labels = () =>
      within(screen.getByRole('group', { name: 'How players answer' }))
        .getAllByRole('radio')
        .map((radio) => radio.parentElement?.textContent?.trim())
    expect(labels()).toEqual(['Multiple choice', 'Type the answer', 'Pick all that apply', 'Put in order'])
    await fireEvent.click(screen.getByLabelText('Put in order'))
    expect(screen.getByLabelText('First end')).toBeTruthy()
    expect(screen.getByLabelText('Put in order')).toHaveProperty('checked', true)
    await fireEvent.click(screen.getByLabelText('Type the answer'))
    expect(screen.queryByLabelText('First end')).toBeNull()
    expect(screen.getByLabelText('Accepted answer 1')).toBeTruthy()
    await fireEvent.click(screen.getByLabelText('Put in order'))

    await type('What are they sorted by?', 'Sort these by combat level.')
    await type('First end', 'Lowest')
    await type('Last end', 'Highest')
    await type('Entry 1', 'Goblin')
    await type('Entry 2', 'Hill Giant')
    await type('Entry 3', 'Black demon')
    await type('Relevant Wiki page', 'https://oldschool.runescape.wiki/w/Combat_level')
    await type('Your name', 'AFKFisher')
    await fireEvent.click(screen.getByRole('button', { name: 'Send to the innkeeper' }))
    expect(vi.mocked(api.sendSuggestion).mock.calls[0]![0].content).toMatchObject({
      type: 'ordering',
      mode: 'bestiary',
      payload: { ends: ['Lowest', 'Highest'], answer: [0, 1, 2] },
    })
  })

  it('makes an NPC’s question name its NPC', async () => {
    played()
    render(Suggest, { navigate })
    await fireEvent.click(await screen.findByRole('button', { name: /A random event question/ }))
    const faces = within(screen.getByRole('radiogroup', { name: 'Who asks it' })).getAllByRole('radio')
    expect(faces.map((face) => face.getAttribute('aria-label'))).not.toContain('A random NPC')
    expect(faces.some((face) => (face as HTMLInputElement).checked)).toBe(false)
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
