/** `/suggest`: only after a game, the limit before any field, and each kind as the server takes it. */

import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as api from '../lib/api'
import { ApiFailure } from '../lib/api'
import { savePastGame } from '../lib/history'
import * as map from '../lib/map'
import { FALLBACK_NPC, npcArt } from '../lib/npcs'
import { CHOICES, choicePath, choiceSlug } from '../lib/suggestions'
import { clearVocabCache } from '../lib/vocab'
import { stubAnimations } from '../test-animate'
import { renderSuggest } from '../test-suggest'

vi.mock('../lib/api', async (importOriginal) => {
  const real = await importOriginal<typeof import('../lib/api')>()
  return {
    ...real,
    getSuggestionAllowance: vi.fn(),
    sendSuggestion: vi.fn(),
    getVocab: vi.fn(),
    getReportChoices: vi.fn(),
    findSimilar: vi.fn(),
  }
})

vi.mock('../lib/map', async (importOriginal) => {
  const real = await importOriginal<typeof import('../lib/map')>()
  return { ...real, tilesLoad: vi.fn(() => Promise.resolve(true)) }
})

const navigate = vi.fn()

function played(): void {
  savePastGame({ code: 'ABYSSAL', finishedAt: '2026-10-01T20:05:00Z', standings: [], youId: null })
}

// The preview's Question/Reveal toggle is labelled too; only fields are typed into.
const FIELD = 'textarea, input:not([type=radio])'

async function type(label: string | RegExp, value: string): Promise<void> {
  await fireEvent.input(screen.getByLabelText(label, { selector: FIELD }), { target: { value } })
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
  vi.mocked(api.findSimilar).mockResolvedValue([])
  vi.mocked(api.getReportChoices).mockImplementation(async (mode) => {
    if (mode === 'prop_hunt') throw new ApiFailure(422, 'bad_mode', 'not here')
    if (mode === 'random_event') {
      return {
        by: 'question',
        choices: [
          { id: 'q1', label: 'Which skill?', random_event: 'bob' },
          { id: 'q2', label: 'Which tome?', random_event: 'reldo' },
        ],
      }
    }
    return { by: 'question', choices: [{ id: `${mode}-1`, label: `A ${mode} question` }] }
  })
})

function existing(): HTMLElement {
  return screen.getByRole('group', { name: 'Already in the game' })
}

function existingRows(): string[] {
  return [...existing().querySelectorAll('li')].map((li) =>
    (li.textContent ?? '').replace(/\s+/g, ' ').trim(),
  )
}

afterEach(cleanup)

describe('Suggest, choosing a game', () => {
  it('fades the list out before the editor comes in', async () => {
    const unstub = stubAnimations()
    try {
      played()
      renderSuggest(null, navigate)
      await fireEvent.click(await screen.findByRole('button', { name: /A popular item/ }))
      expect(screen.getByRole('heading', { name: 'What would you like to suggest?' })).toBeTruthy()
      await waitFor(() =>
        expect(
          screen.queryByRole('heading', { name: 'What would you like to suggest?' }),
        ).toBeNull(),
      )
      expect(screen.getByRole('button', { name: 'Send to Reldo' })).toBeTruthy()
    } finally {
      unstub()
    }
  })
})

const CARDS_HEADING = { name: 'What would you like to suggest?' }

async function itemForm(): Promise<HTMLElement> {
  return screen.findByLabelText(/Item name/, { selector: FIELD })
}

describe('Suggest, addresses', () => {
  it('gives every card an address of its own', () => {
    const paths = CHOICES.map(choicePath)
    expect(new Set(paths).size).toBe(CHOICES.length)
    expect(paths).toEqual(
      expect.arrayContaining(['/suggest/item', '/suggest/any', '/suggest/kgp-recon']),
    )
  })

  it('goes to a card’s address on picking it, and to /suggest on All suggestion types', async () => {
    played()
    renderSuggest(null, navigate)
    await fireEvent.click(await screen.findByRole('button', { name: /A popular item/ }))
    expect(navigate).toHaveBeenLastCalledWith('/suggest/item')
    await itemForm()
    await fireEvent.click(screen.getByRole('button', { name: '← All suggestion types' }))
    expect(navigate).toHaveBeenLastCalledWith('/suggest')
    await screen.findByRole('heading', CARDS_HEADING)
  })

  it('follows Back and Forward between the cards and a card, checking the limit once', async () => {
    played()
    const view = renderSuggest(null, navigate)
    await screen.findByRole('heading', CARDS_HEADING)
    await view.rerender({ card: 'item' })
    await itemForm()
    await view.rerender({ card: null })
    await screen.findByRole('heading', CARDS_HEADING)
    await view.rerender({ card: 'item' })
    expect(((await itemForm()) as HTMLInputElement).value).toBe('')
    expect(api.getSuggestionAllowance).toHaveBeenCalledTimes(1)
  })

  it('opens a card’s editor straight from its address', async () => {
    played()
    renderSuggest('item', navigate)
    await itemForm()
    expect(screen.queryByRole('heading', CARDS_HEADING)).toBeNull()
  })

  it('opens the cards for an address no card has', async () => {
    played()
    renderSuggest('no-such-card', navigate)
    await screen.findByRole('heading', CARDS_HEADING)
  })

  it('waits for the map before opening a map round from its address', async () => {
    const place = choiceSlug(CHOICES.find((choice) => choice.editor === 'place')!)
    played()
    renderSuggest(place, navigate)
    await screen.findByRole('button', { name: 'Send to Reldo' })
    expect(screen.queryByRole('heading', CARDS_HEADING)).toBeNull()
  })

  it('opens the cards for a map round while the map does not load', async () => {
    vi.mocked(map.tilesLoad).mockResolvedValueOnce(false)
    played()
    renderSuggest(choiceSlug(CHOICES.find((choice) => choice.editor === 'place')!), navigate)
    await screen.findByRole('heading', CARDS_HEADING)
  })

  it('keeps the card’s address on the thanks and Suggest another, and Back leaves them', async () => {
    played()
    const view = renderSuggest(null, navigate)
    await fireEvent.click(await screen.findByRole('button', { name: /A popular item/ }))
    await type(/Item name/, 'Ancient mace')
    await type('Your name', 'AFKFisher')
    await fireEvent.click(screen.getByRole('button', { name: 'Send to Reldo' }))
    await fireEvent.click(await screen.findByRole('button', { name: 'Suggest another' }))
    await itemForm()
    await type(/Item name/, 'Dragon mace')
    await type('Your name', 'AFKFisher')
    await fireEvent.click(screen.getByRole('button', { name: 'Send to Reldo' }))
    await screen.findByRole('heading', { name: /on Reldo's desk/ })
    expect(navigate.mock.calls).toEqual([['/suggest/item']])
    await view.rerender({ card: null })
    await screen.findByRole('heading', CARDS_HEADING)
  })
})

describe('Suggest', () => {
  it('asks for a game first, and asks the server nothing', () => {
    renderSuggest(null, navigate)
    expect(screen.getByText(/Play a game first/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Guess the Examine/ })).toBeNull()
    expect(api.getSuggestionAllowance).not.toHaveBeenCalled()
  })

  it('points a player who has not played yet to a game, to How to play and to Home', async () => {
    renderSuggest(null, navigate)
    for (const [name, to] of [
      ['Create a room', '/create'],
      ['How to play', '/how-to-play'],
      ['Home', '/'],
    ]) {
      await fireEvent.click(screen.getByRole('button', { name }))
      expect(navigate).toHaveBeenLastCalledWith(to)
    }
  })

  it('says the limit is reached before showing a single field', async () => {
    played()
    const retry = new Date(Date.now() + 22 * 60_000 + 5_000).toISOString()
    vi.mocked(api.getSuggestionAllowance).mockResolvedValue({ left: 0, retry_at: retry })
    renderSuggest(null, navigate)
    await screen.findByText(/Try again in 23 minutes/)
    expect(screen.queryByRole('button', { name: /Guess the Examine/ })).toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('sends an item under the player’s credit, never shown, and thanks them', async () => {
    played()
    renderSuggest(null, navigate)
    await fireEvent.click(await screen.findByRole('button', { name: /A popular item/ }))
    await fireEvent.click(screen.getByRole('button', { name: 'Send to Reldo' }))
    expect(screen.getByText(/Required: the item’s name/)).toBeTruthy()
    expect(screen.getByText(/Required: a name to credit/)).toBeTruthy()
    expect(api.sendSuggestion).not.toHaveBeenCalled()

    const shown = screen.getByLabelText(/Show my name to players/) as HTMLInputElement
    expect(shown.disabled).toBe(true)
    expect(shown.checked).toBe(false)
    expect(
      screen.getByText(/Pixel Hunt do not support displaying the author of a question/),
    ).toBeTruthy()
    expect(screen.getByText(/for More or Less, The Price is Right and Pixel Hunt\./)).toBeTruthy()

    await type(/Item name/, ' Ancient mace ')
    await type('Your name', 'AFKFisher')
    await fireEvent.click(screen.getByRole('button', { name: 'Send to Reldo' }))
    expect(api.sendSuggestion).toHaveBeenCalledWith({
      kind: 'item',
      content: { name: 'Ancient mace' },
      credit: 'AFKFisher',
      credit_shown: false,
    })
    await screen.findByRole('heading', { name: /on Reldo's desk/ })
  })

  it('opens a fresh form of the same kind on Suggest another', async () => {
    played()
    renderSuggest(null, navigate)
    await fireEvent.click(await screen.findByRole('button', { name: /A popular item/ }))
    await type(/Item name/, 'Ancient mace')
    await type('Your name', 'AFKFisher')
    await fireEvent.click(screen.getByRole('button', { name: 'Send to Reldo' }))
    await fireEvent.click(await screen.findByRole('button', { name: 'Suggest another' }))
    const name = (await screen.findByLabelText(/Item name/, {
      selector: FIELD,
    })) as HTMLInputElement
    expect(name.value).toBe('')
    expect(screen.queryByText('What would you like to suggest?')).toBeNull()
    expect(api.getSuggestionAllowance).toHaveBeenCalledTimes(2)
  })

  it('lists the items already in the game, searchable, and refuses one of them', async () => {
    played()
    renderSuggest(null, navigate)
    await fireEvent.click(await screen.findByRole('button', { name: /A popular item/ }))
    const roster = screen.getByRole('region', { name: 'Already in the game' })
    expect(screen.queryByRole('group', { name: 'Already in the game' })).toBeNull()
    expect(api.getReportChoices).not.toHaveBeenCalled()
    await waitFor(() => expect(roster.querySelectorAll('li')).toHaveLength(3))
    await fireEvent.input(screen.getByLabelText('Search the items already in the game'), {
      target: { value: 'abys' },
    })
    const listed = [...roster.querySelectorAll('li')].map((li) => li.textContent)
    expect(listed).toEqual(['Abyssal bludgeon', 'Abyssal whip'])

    await type(/Item name/, 'abyssal WHIP ')
    await type('Your name', 'AFKFisher')
    await fireEvent.click(screen.getByRole('button', { name: 'Send to Reldo' }))
    expect(screen.getByText('Already in the game.')).toBeTruthy()
    expect(api.sendSuggestion).not.toHaveBeenCalled()
  })

  it('shows each question card’s pack questions beside the editor, searchable', async () => {
    played()
    renderSuggest(null, navigate)
    const cards = CHOICES.filter((choice) => choice.kind === 'question' && choice.id !== 'no_round')
    for (const card of cards.filter((c) => !['random_event', 'prop_hunt'].includes(c.id))) {
      await fireEvent.click(await screen.findByRole('button', { name: new RegExp(card.label) }))
      await waitFor(() => expect(existingRows()).toEqual([`A ${card.id} question`]))
      expect(screen.getByLabelText('Search the questions already in the game')).toBeTruthy()
      await fireEvent.click(screen.getByRole('button', { name: /All suggestion types/ }))
    }
    expect(vi.mocked(api.getReportChoices).mock.calls.map(([mode]) => mode)).toEqual(
      cards.map((c) => c.id).filter((id) => !['random_event', 'prop_hunt'].includes(id)),
    )
  })

  it('says Prop Hunt has no questions yet, in one line and no error', async () => {
    played()
    renderSuggest(null, navigate)
    await fireEvent.click(await screen.findByRole('button', { name: /Prop Hunt/ }))
    await within(existing()).findByText('The game has no questions here yet.')
    expect(document.querySelector('.banner')).toBeNull()
  })

  it('names the NPC on each random event row, the one picked to ask first', async () => {
    played()
    renderSuggest(null, navigate)
    await fireEvent.click(await screen.findByRole('button', { name: /A random event question/ }))
    await waitFor(() =>
      expect(existingRows()).toEqual(['Evil Bob Which skill?', 'Reldo Which tome?']),
    )
    await fireEvent.click(screen.getByRole('radio', { name: 'Reldo' }))
    expect(existingRows()).toEqual(['Reldo Which tome?', 'Evil Bob Which skill?'])
    await fireEvent.click(screen.getByLabelText('Put in order'))
    expect(existingRows()).toEqual(['Evil Bob Which skill?', 'Reldo Which tome?'])
  })

  it('writes an examine as a multiple-choice question of four to six names', async () => {
    played()
    renderSuggest(null, navigate)
    await fireEvent.click(await screen.findByRole('button', { name: /Guess the Examine/ }))
    expect(screen.queryByRole('group', { name: 'How players answer' })).toBeNull()
    expect(screen.queryByLabelText(/Another source/)).toBeNull()
    expect(screen.getAllByRole('textbox', { name: /^Answer \d$/ })).toHaveLength(4)
    const remove = screen.getAllByRole('button', { name: /^Remove answer/ }) as HTMLButtonElement[]
    expect(remove.every((button) => button.disabled)).toBe(true)
    const add = screen.getByRole('button', { name: 'Add an answer' }) as HTMLButtonElement
    await fireEvent.click(add)
    await fireEvent.click(add)
    expect(screen.getAllByRole('textbox', { name: /^Answer \d$/ })).toHaveLength(6)
    expect(add.disabled).toBe(true)
    await fireEvent.click(screen.getByRole('button', { name: 'Remove answer 6' }))
    await fireEvent.click(screen.getByRole('button', { name: 'Remove answer 5' }))

    await type('Question', 'Yuck, I don’t like cabbage.')
    for (const [index, name] of ['Onion', 'Cabbage', 'Potato', 'Leek'].entries()) {
      await type(`Answer ${index + 1}`, name)
    }
    await fireEvent.click(screen.getByLabelText('Answer 2 is right'))
    const preview = screen.getByRole('region', { name: 'Preview' })
    expect(preview.textContent).toContain('Yuck, I don’t like cabbage.')
    expect(within(preview).getAllByRole('button')).toHaveLength(4)
    await fireEvent.click(screen.getByRole('radio', { name: 'Medium' }))
    await type('Your name', 'AFKFisher')
    await fireEvent.click(screen.getByRole('button', { name: 'Send to Reldo' }))
    expect(screen.getByText('Required: the page you checked it on.')).toBeTruthy()
    expect(api.sendSuggestion).not.toHaveBeenCalled()

    await type('Relevant Wiki page', 'https://oldschool.runescape.wiki/w/Cabbage')
    await fireEvent.click(screen.getByRole('button', { name: 'Send to Reldo' }))
    expect(api.sendSuggestion).toHaveBeenCalledWith({
      kind: 'question',
      content: {
        type: 'multiple_choice',
        payload: {
          prompt: 'Yuck, I don’t like cabbage.',
          options: ['Onion', 'Cabbage', 'Potato', 'Leek'],
          answer_index: 1,
        },
        mode: 'guess_examine',
        difficulty: 'medium',
        wiki: 'https://oldschool.runescape.wiki/w/Cabbage',
      },
      credit: 'AFKFisher',
      credit_shown: false,
    })
  })

  it('writes a round’s question with no NPC, one type, its fixed prompt and its wiki page', async () => {
    played()
    renderSuggest(null, navigate)
    await fireEvent.click(await screen.findByRole('button', { name: /Odd One Out/ }))
    expect(screen.queryByLabelText('Who asks it')).toBeNull()
    expect(screen.queryByRole('group', { name: 'How players answer' })).toBeNull()
    const question = screen.getByLabelText<HTMLTextAreaElement>('Question', {
      selector: 'textarea',
    })
    expect(question.value).toBe("Which one doesn't belong?")
    expect(question.readOnly).toBe(true)
    const tier = within(screen.getByRole('group', { name: 'How hard is it?' }))
    expect(tier.getByRole<HTMLInputElement>('radio', { name: 'Medium' }).checked).toBe(false)
    expect(tier.getByRole<HTMLInputElement>('radio', { name: 'Easy' }).checked).toBe(false)
    expect(tier.getByRole<HTMLInputElement>('radio', { name: 'Hard' }).checked).toBe(false)
    await fireEvent.click(tier.getByRole('radio', { name: 'Hard' }))
    await type('Answer 1', 'Dharok')
    await type('Answer 2', 'Hazelmere')
    await type('Answer 3', 'Guthan')
    await type('Answer 4', 'Verac')
    await fireEvent.click(screen.getByLabelText('Answer 2 is right'))
    await type('Your name', 'AFKFisher')
    await fireEvent.click(screen.getByRole('button', { name: 'Send to Reldo' }))
    expect(
      screen.getByText(/Required: the wiki page you checked it on, or another https link/),
    ).toBeTruthy()
    expect(api.sendSuggestion).not.toHaveBeenCalled()

    await type('Relevant Wiki page', 'https://oldschool.runescape.wiki/w/Barrows_Brothers')
    await fireEvent.click(screen.getByRole('button', { name: 'Send to Reldo' }))
    expect(api.sendSuggestion).toHaveBeenCalledWith({
      kind: 'question',
      content: {
        type: 'multiple_choice',
        payload: {
          prompt: "Which one doesn't belong?",
          options: ['Dharok', 'Hazelmere', 'Guthan', 'Verac'],
          answer_index: 1,
        },
        mode: 'odd_one_out',
        difficulty: 'hard',
        wiki: 'https://oldschool.runescape.wiki/w/Barrows_Brothers',
      },
      credit: 'AFKFisher',
      credit_shown: false,
    })
  })

  it('keeps an Odd One Out to the four to six names its round plays', async () => {
    played()
    renderSuggest(null, navigate)
    await fireEvent.click(await screen.findByRole('button', { name: /Odd One Out/ }))
    expect(screen.getAllByRole('textbox', { name: /^Answer \d$/ })).toHaveLength(4)
    const add = screen.getByRole('button', { name: 'Add an answer' }) as HTMLButtonElement
    await fireEvent.click(add)
    await fireEvent.click(add)
    expect(screen.getAllByRole('textbox', { name: /^Answer \d$/ })).toHaveLength(6)
    expect(add.disabled).toBe(true)
    await fireEvent.click(screen.getByRole('button', { name: 'Remove answer 6' }))
    await fireEvent.click(screen.getByRole('button', { name: 'Remove answer 5' }))
    const remove = screen.getAllByRole('button', { name: /^Remove answer/ }) as HTMLButtonElement[]
    expect(remove.every((button) => button.disabled)).toBe(true)

    await fireEvent.click(screen.getByRole('radio', { name: 'Easy' }))
    await type('Answer 1', 'Dharok')
    await type('Answer 2', 'Hazelmere')
    await type('Answer 3', 'Guthan')
    await fireEvent.click(screen.getByLabelText('Answer 2 is right'))
    await type('Your name', 'AFKFisher')
    await type('Relevant Wiki page', 'https://oldschool.runescape.wiki/w/Barrows_Brothers')
    await fireEvent.click(screen.getByRole('button', { name: 'Send to Reldo' }))
    expect(api.sendSuggestion).not.toHaveBeenCalled()
  })

  it('lets a Who Said That? carry its quote, and be sent with a non-wiki source', async () => {
    played()
    renderSuggest(null, navigate)
    await fireEvent.click(await screen.findByRole('button', { name: /Who Said That/ }))
    const question = screen.getByLabelText<HTMLTextAreaElement>('Question', {
      selector: 'textarea',
    })
    expect(question.value).toBe('Who said that?')
    expect(question.readOnly).toBe(false)
    await type('Question', 'Who said this?')
    await type(/The quotation/, 'Never gonna give you up')
    const preview = screen.getByRole('region', { name: 'Preview' })
    expect(preview.querySelector('blockquote')?.textContent).toBe('Never gonna give you up')
    await type('Answer 1', 'Rick')
    await type('Answer 2', 'Zezima')
    await fireEvent.click(screen.getByRole('radio', { name: 'Medium' }))
    await type('Your name', 'AFKFisher')
    await fireEvent.click(screen.getByRole('button', { name: 'Send to Reldo' }))
    expect(screen.getByText(/or another https link/)).toBeTruthy()
    expect(api.sendSuggestion).not.toHaveBeenCalled()

    await type(/Another source/, 'http://example.com/clip')
    await fireEvent.click(screen.getByRole('button', { name: 'Send to Reldo' }))
    expect(screen.getByText('A link starting https://.')).toBeTruthy()
    expect(api.sendSuggestion).not.toHaveBeenCalled()

    await type(/Another source/, ' https://www.youtube.com/watch?v=dQw4w9WgXcQ ')
    await fireEvent.click(screen.getByRole('button', { name: 'Send to Reldo' }))
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
        difficulty: 'medium',
        source_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      },
      credit: 'AFKFisher',
      credit_shown: false,
    })
  })

  it('offers a quotation only to the rounds that show one', async () => {
    played()
    renderSuggest(null, navigate)
    await fireEvent.click(await screen.findByRole('button', { name: /Bestiary/ }))
    expect(screen.queryByLabelText(/The quotation/)).toBeNull()
    expect(screen.getByLabelText('Another source, if the wiki can’t show it')).toBeTruthy()
  })

  it('offers an intro to an NPC’s question, previews it and sends it, and no picture', async () => {
    played()
    renderSuggest(null, navigate)
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
    expect(screen.getByText('Pssst, adventurer.', { selector: '.lore' })).toBeTruthy()
    await fireEvent.click(screen.getByRole('button', { name: 'Send to Reldo' }))
    const sent = vi.mocked(api.sendSuggestion).mock.calls[0]?.[0] as {
      content: { payload: object }
    }
    expect(sent.content.payload).toMatchObject({ intro: 'Pssst, adventurer.' })
  })

  it('offers no intro or picture to a round’s question', async () => {
    played()
    renderSuggest(null, navigate)
    await fireEvent.click(await screen.findByRole('button', { name: /Drop Table/ }))
    expect(screen.queryByLabelText(/^Intro/)).toBeNull()
    expect(screen.queryByLabelText(/^Picture/)).toBeNull()
  })

  it('sends both sources when both are given', async () => {
    played()
    renderSuggest(null, navigate)
    await fireEvent.click(await screen.findByRole('button', { name: /Know Your Content Creator/ }))
    expect(screen.getByLabelText(/The quotation/)).toBeTruthy()
    await type('Question', 'Which game did they stream first?')
    await type('Answer 1', 'RuneScape')
    await type('Answer 2', 'Minecraft')
    await type('Relevant Wiki page', 'https://oldschool.runescape.wiki/w/Zezima')
    await type(/Another source/, 'https://example.com/clip')
    await fireEvent.click(screen.getByRole('radio', { name: 'Medium' }))
    await type('Your name', 'AFKFisher')
    await fireEvent.click(screen.getByRole('button', { name: 'Send to Reldo' }))
    const sent = vi.mocked(api.sendSuggestion).mock.calls[0]![0].content
    expect(sent).toMatchObject({
      wiki: 'https://oldschool.runescape.wiki/w/Zezima',
      source_url: 'https://example.com/clip',
    })
    expect((sent as { payload: object }).payload).not.toHaveProperty('quote')
  })

  it('writes a Sort It Out order from entries and tie boxes, and sends ranks', async () => {
    played()
    renderSuggest(null, navigate)
    const card = await screen.findByRole('button', { name: /Sort It Out/ })
    expect(card.textContent).toContain('Something worth putting in order.')
    await fireEvent.click(card)
    expect(screen.queryByRole('group', { name: 'How players answer' })).toBeNull()
    expect(screen.queryByLabelText('Who asks it')).toBeNull()
    await fireEvent.click(screen.getByRole('button', { name: 'Send to Reldo' }))
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
    await fireEvent.click(screen.getByRole('radio', { name: 'Medium' }))
    await type('Your name', 'AFKFisher')
    await fireEvent.click(screen.getByRole('button', { name: 'Send to Reldo' }))
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
        difficulty: 'medium',
        wiki: 'https://oldschool.runescape.wiki/w/Crafting',
      },
      credit: 'AFKFisher',
      credit_shown: false,
    })
  })

  it('keeps the entries between three and six', async () => {
    played()
    renderSuggest(null, navigate)
    await fireEvent.click(await screen.findByRole('button', { name: /Sort It Out/ }))
    expect(screen.getByRole('button', { name: 'Remove entry 1' }).hasAttribute('disabled')).toBe(
      true,
    )
    for (let i = 0; i < 3; i += 1) {
      await fireEvent.click(screen.getByRole('button', { name: 'Add an entry' }))
    }
    expect(screen.getByRole('button', { name: 'Add an entry' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByLabelText('Entry 6')).toBeTruthy()
    expect(screen.queryByLabelText('Entry 7')).toBeNull()
  })

  it('writes a Drop Table answer to type, with the typos it allows', async () => {
    played()
    renderSuggest(null, navigate)
    await fireEvent.click(await screen.findByRole('button', { name: /Drop Table/ }))
    await fireEvent.click(screen.getByLabelText('Type the answer'))
    await type('Question', 'Which monster drops the Abyssal whip?')
    await type('Accepted answer 1', 'Abyssal demon')
    await fireEvent.click(
      within(screen.getByRole('group', { name: 'Typos allowed' })).getByLabelText('2'),
    )
    await type('Relevant Wiki page', 'https://oldschool.runescape.wiki/w/Abyssal_demon')
    await fireEvent.click(screen.getByRole('radio', { name: 'Medium' }))
    await type('Your name', 'AFKFisher')
    await fireEvent.click(screen.getByRole('button', { name: 'Send to Reldo' }))
    expect(vi.mocked(api.sendSuggestion).mock.calls[0]![0].content).toMatchObject({
      type: 'free_text',
      mode: 'drop_table',
      payload: {
        prompt: 'Which monster drops the Abyssal whip?',
        accepted: ['Abyssal demon'],
        max_distance: 2,
      },
    })
  })

  it('sends a Drop Table question with the item to show, previewed without a picture', async () => {
    played()
    renderSuggest(null, navigate)
    await fireEvent.click(await screen.findByRole('button', { name: /Drop Table/ }))
    await fireEvent.click(screen.getByLabelText('Closest number'))
    await type('Question', 'A Lizardman shaman drops a Dragon warhammer once in how many kills?')
    await type('Answer', '3000')
    await type('Item to show, if any', '  Dragon warhammer ')
    await type('Relevant Wiki page', 'https://oldschool.runescape.wiki/w/Dragon_warhammer')
    await fireEvent.click(screen.getByRole('radio', { name: 'Medium' }))
    await type('Your name', 'AFKFisher')
    expect(document.querySelector('.picture')).toBeNull()
    await fireEvent.click(screen.getByRole('button', { name: 'Send to Reldo' }))
    const content = vi.mocked(api.sendSuggestion).mock.calls[0]![0].content
    expect(content).toMatchObject({ type: 'closest_number', picture_item: 'Dragon warhammer' })
    expect(content).not.toHaveProperty('payload.image')
  })

  it('sends a slider with its ends only once they are given, and previews the slider', async () => {
    played()
    renderSuggest(null, navigate)
    await fireEvent.click(await screen.findByRole('button', { name: /Bestiary/ }))
    await fireEvent.click(screen.getByLabelText('Slider'))
    await type('Question', "What is General Graardor's combat level?")
    await type('Answer', '624')
    await type('Relevant Wiki page', 'https://oldschool.runescape.wiki/w/General_Graardor')
    await fireEvent.click(screen.getByRole('radio', { name: 'Medium' }))
    await type('Your name', 'AFKFisher')
    await fireEvent.click(screen.getByRole('button', { name: 'Send to Reldo' }))
    expect(api.sendSuggestion).not.toHaveBeenCalled()
    await type('Lowest', '100')
    await type('Highest', '1000')
    expect(screen.getByRole('slider').getAttribute('aria-valuenow')).toBe('550')
    await fireEvent.click(screen.getByLabelText('Log'))
    await fireEvent.click(screen.getByRole('button', { name: 'Send to Reldo' }))
    expect(vi.mocked(api.sendSuggestion).mock.calls[0]![0].content).toMatchObject({
      type: 'number_slider',
      mode: 'bestiary',
      payload: { answer: 624, min: 100, max: 1000, scale: 'log' },
    })
  })

  it('sends no item to show when none is named, and asks only Drop Table', async () => {
    played()
    renderSuggest(null, navigate)
    await fireEvent.click(await screen.findByRole('button', { name: /Drop Table/ }))
    await type('Question', 'Which monster drops the Abyssal whip?')
    await type('Answer 1', 'Abyssal demon')
    await type('Answer 2', 'Greater demon')
    await type('Relevant Wiki page', 'https://oldschool.runescape.wiki/w/Abyssal_demon')
    await fireEvent.click(screen.getByRole('radio', { name: 'Medium' }))
    await type('Your name', 'AFKFisher')
    await fireEvent.click(screen.getByRole('button', { name: 'Send to Reldo' }))
    expect(vi.mocked(api.sendSuggestion).mock.calls[0]![0].content).not.toHaveProperty(
      'picture_item',
    )
    cleanup()
    renderSuggest(null, navigate)
    await fireEvent.click(await screen.findByRole('button', { name: /Bestiary/ }))
    expect(screen.queryByLabelText('Item to show, if any')).toBeNull()
  })

  it('names a Who’s That NPC?, refusing one the game asks about, and needs its wiki page', async () => {
    played()
    vi.mocked(api.getReportChoices).mockResolvedValue({
      by: 'question',
      choices: [{ id: 'q9', label: 'Vorkath', npc: 8058 }],
    })
    renderSuggest(null, navigate)
    await fireEvent.click(await screen.findByRole('button', { name: /Who is That NPC\?/ }))
    await waitFor(() => expect(existingRows()).toEqual(['Vorkath']))
    await type('Monster or NPC, as the wiki spells it', ' vorkath')
    await fireEvent.click(screen.getByRole('radio', { name: 'Medium' }))
    await type('Your name', 'AFKFisher')
    await fireEvent.click(screen.getByRole('button', { name: 'Send to Reldo' }))
    expect(screen.getByText('Already in the game.')).toBeTruthy()
    expect(screen.getByText(/Required: the page you checked it on/)).toBeTruthy()
    expect(api.sendSuggestion).not.toHaveBeenCalled()

    await type('Monster or NPC, as the wiki spells it', ' Araxxor ')
    await type('Relevant Wiki page', 'https://oldschool.runescape.wiki/w/Araxxor')
    const preview = screen.getByRole('region', { name: 'Preview' })
    expect(within(preview).queryByText("Who's that NPC?")).toBeNull()
    expect(preview.querySelector('.picture img')).toBeNull()
    expect(preview.querySelector('.picture .placeholder')?.textContent).toBe(
      'The picture is added once imported.',
    )
    expect(within(preview).getByRole<HTMLInputElement>('combobox').disabled).toBe(true)
    expect(within(preview).getByText('The answer joins the list once imported.')).toBeTruthy()
    await fireEvent.click(screen.getByRole('button', { name: 'Send to Reldo' }))
    expect(api.sendSuggestion).toHaveBeenCalledWith({
      kind: 'question',
      content: {
        type: 'pick_from_list',
        payload: { prompt: "Who's that NPC?", subject: { name: 'Araxxor' } },
        mode: 'whos_that_npc',
        difficulty: 'medium',
        wiki: 'https://oldschool.runescape.wiki/w/Araxxor',
      },
      credit: 'AFKFisher',
      credit_shown: false,
    })
  })

  async function verseForm(): Promise<void> {
    played()
    renderSuggest(null, navigate)
    await fireEvent.click(await screen.findByRole('button', { name: /The Forgetful Bard/ }))
    await screen.findByLabelText('The verse Falo sings')
    await waitFor(() => expect(api.getVocab).toHaveBeenCalledWith('items'))
  }

  it('writes a verse about an item picked from the list, filling in its wiki page', async () => {
    await verseForm()
    await type('The verse Falo sings', ' It cracks from the Abyss. ')
    await type('The item it describes', 'abys')
    await fireEvent.click(await screen.findByRole('option', { name: 'Abyssal whip' }))
    expect(
      screen.getByLabelText<HTMLInputElement>('Relevant Wiki page', { selector: FIELD }).value,
    ).toBe('https://oldschool.runescape.wiki/w/Abyssal_whip')
    expect(screen.queryByText(/Not on the list yet/)).toBeNull()
    const preview = screen.getByRole('region', { name: 'Preview' })
    expect(preview.querySelector('.picture')).toBeNull()
    expect(within(preview).getByText(/It cracks from the Abyss/)).toBeTruthy()
    expect(within(preview).getByRole<HTMLInputElement>('combobox').disabled).toBe(false)
    expect(screen.queryByText(/Explanation/)).toBeNull()

    await fireEvent.click(screen.getByRole('radio', { name: 'Easy' }))
    await type('Your name', 'AFKFisher')
    await fireEvent.click(screen.getByRole('button', { name: 'Send to Reldo' }))
    expect(api.sendSuggestion).toHaveBeenCalledWith({
      kind: 'question',
      content: {
        type: 'pick_from_list',
        payload: { prompt: 'It cracks from the Abyss.', subject: { name: 'Abyssal whip' } },
        mode: 'forgetful_bard',
        wiki: 'https://oldschool.runescape.wiki/w/Abyssal_whip',
        difficulty: 'easy',
      },
      credit: 'AFKFisher',
      credit_shown: false,
    })
  })

  it('keeps a typed item the list lacks, and a wiki page the player wrote', async () => {
    await verseForm()
    await type('The verse Falo sings', 'A rusty thing for a dusty door.')
    await type('Relevant Wiki page', 'https://oldschool.runescape.wiki/w/Keys')
    await type('The item it describes', 'Brass key')
    expect(
      screen.getByLabelText<HTMLInputElement>('Relevant Wiki page', { selector: FIELD }).value,
    ).toBe('https://oldschool.runescape.wiki/w/Keys')
    expect(screen.getByText(/Not on the list yet/)).toBeTruthy()
    const preview = screen.getByRole('region', { name: 'Preview' })
    expect(within(preview).getByRole<HTMLInputElement>('combobox').disabled).toBe(true)
  })

  it('refuses a verse that names its item, and a variant, before they are sent', async () => {
    await verseForm()
    await type('The verse Falo sings', 'My ABYSSAL whip goes crack.')
    await type('The item it describes', 'Abyssal whip')
    await fireEvent.click(screen.getByRole('button', { name: 'Send to Reldo' }))
    expect(screen.getByText('The verse gives its answer away.')).toBeTruthy()

    await type('The verse Falo sings', 'It goes crack.')
    await type('The item it describes', 'Dragon scimitar (or)')
    expect(screen.getByText('Name the plain item, with no variant or dose.')).toBeTruthy()
    expect(api.sendSuggestion).not.toHaveBeenCalled()
  })

  const CLUE_TEXT = [
    'I have travelled further than most adventurers.',
    'I was not always the shape I am now.',
    'You will find me wandering towns, never the same one for long.',
    'A certain amulet lets you hear what I have to say.',
    'Meow.',
  ]
  const RUNGS = [
    '1. Vague / atmospheric',
    '2. Domain / context',
    '3. Specific trait',
    '4. Strong giveaway',
    '5. Punchline',
  ]

  async function riddleForm(): Promise<void> {
    vi.mocked(api.getVocab).mockResolvedValue({
      vocab: 'subjects',
      version: 'v',
      entries: [
        { id: 6, name: 'Bob (cat)' },
        { id: 49, name: 'Varrock' },
      ],
    })
    played()
    renderSuggest(null, navigate)
    await fireEvent.click(await screen.findByRole('button', { name: /Riddles of the Sphinx/ }))
    await screen.findByLabelText(RUNGS[0]!)
    await waitFor(() => expect(api.getVocab).toHaveBeenCalledWith('subjects'))
  }

  it('writes five clues, each rung labelled with its example greyed out', async () => {
    await riddleForm()
    RUNGS.forEach((rung, n) => {
      expect(screen.getByLabelText<HTMLInputElement>(rung).placeholder).toBe(CLUE_TEXT[n])
    })
    await type('The NPC, item or place it describes', 'bob')
    await fireEvent.click(await screen.findByRole('option', { name: 'Bob (cat)' }))
    for (const [n, rung] of RUNGS.entries()) await type(rung, ` ${CLUE_TEXT[n]} `)
    await fireEvent.click(screen.getByRole('radio', { name: 'Medium' }))
    await type('Your name', 'AFKFisher')
    await fireEvent.click(screen.getByRole('button', { name: 'Send to Reldo' }))
    expect(api.sendSuggestion).toHaveBeenCalledWith({
      kind: 'question',
      content: {
        type: 'pick_from_list',
        payload: { prompt: 'Who or what am I?', subject: { name: 'Bob (cat)' }, clues: CLUE_TEXT },
        mode: 'riddles_of_the_sphinx',
        wiki: 'https://oldschool.runescape.wiki/w/Bob_(cat)',
        difficulty: 'medium',
      },
      credit: 'AFKFisher',
      credit_shown: false,
    })
  })

  it('refuses a riddle with a clue left out', async () => {
    await riddleForm()
    await type('The NPC, item or place it describes', 'Varrock')
    for (const [n, rung] of RUNGS.slice(0, 4).entries()) await type(rung, CLUE_TEXT[n]!)
    await fireEvent.click(screen.getByRole('button', { name: 'Send to Reldo' }))
    expect(screen.getByText('Required: a clue.')).toBeTruthy()
    expect(api.sendSuggestion).not.toHaveBeenCalled()
  })

  it('does not offer the list’s variants for a verse', async () => {
    vi.mocked(api.getVocab).mockResolvedValue({
      vocab: 'items',
      version: 'v',
      entries: [...ROSTER, { id: 11335, name: 'Abyssal whip (or)' }],
    })
    await verseForm()
    await type('The item it describes', 'abys')
    expect(await screen.findByRole('option', { name: 'Abyssal whip' })).toBeTruthy()
    expect(screen.queryByRole('option', { name: 'Abyssal whip (or)' })).toBeNull()
  })

  it('keeps a Who’s That NPC? shadow’s name across a swap to Render and back', async () => {
    played()
    renderSuggest(null, navigate)
    await fireEvent.click(await screen.findByRole('button', { name: /Who is That NPC\?/ }))
    await type('Monster or NPC, as the wiki spells it', 'Spotted kebbit')
    await fireEvent.click(screen.getByLabelText('Render'))
    await fireEvent.click(screen.getByLabelText('Shadow'))
    expect(
      screen.getByLabelText<HTMLInputElement>('Monster or NPC, as the wiki spells it').value,
    ).toBe('Spotted kebbit')
  })

  it('writes a Who’s That NPC? render on buttons, even of an NPC only a render asks about', async () => {
    played()
    vi.mocked(api.getReportChoices).mockResolvedValue({
      by: 'question',
      choices: [{ id: 'q8', label: 'Spotted kebbit' }],
    })
    renderSuggest(null, navigate)
    await fireEvent.click(await screen.findByRole('button', { name: /Who is That NPC\?/ }))
    await waitFor(() => expect(existingRows()).toEqual(['Spotted kebbit']))
    await type('Monster or NPC, as the wiki spells it', 'Spotted kebbit')
    await type('Your name', 'AFKFisher')
    await fireEvent.click(screen.getByRole('button', { name: 'Send to Reldo' }))
    expect(screen.queryByText('Already in the game.')).toBeNull()

    await fireEvent.click(screen.getByLabelText('Render'))
    expect(screen.queryByLabelText('Monster or NPC, as the wiki spells it')).toBeNull()
    expect(screen.queryByLabelText(/Explanation/)).toBeNull()
    expect(screen.getByText(/Players see the right answer's render/)).toBeTruthy()
    await type('Answer 1', 'Dark kebbit')
    await type('Answer 2', 'Spotted kebbit')
    await type('Relevant Wiki page', 'https://oldschool.runescape.wiki/w/Dark_kebbit')
    await fireEvent.click(screen.getByRole('radio', { name: 'Medium' }))
    await fireEvent.click(screen.getByRole('button', { name: 'Send to Reldo' }))
    expect(vi.mocked(api.sendSuggestion).mock.calls[0]![0].content).toMatchObject({
      type: 'multiple_choice',
      mode: 'whos_that_npc',
      wiki: 'https://oldschool.runescape.wiki/w/Dark_kebbit',
      payload: {
        prompt: "Who's that NPC?",
        options: ['Dark kebbit', 'Spotted kebbit'],
        answer_index: 0,
      },
    })

    cleanup()
    renderSuggest(null, navigate)
    await fireEvent.click(await screen.findByRole('button', { name: /Who is That NPC\?/ }))
    const labels = within(screen.getByRole('group', { name: 'How players answer' }))
      .getAllByRole('radio')
      .map((radio) => radio.parentElement?.textContent?.trim())
    expect(labels).toEqual(['Shadow', 'Render'])
  })

  it('swaps Bestiary’s form between asking and sorting from one type picker', async () => {
    played()
    renderSuggest(null, navigate)
    await fireEvent.click(await screen.findByRole('button', { name: /Bestiary/ }))
    const labels = () =>
      within(screen.getByRole('group', { name: 'How players answer' }))
        .getAllByRole('radio')
        .map((radio) => radio.parentElement?.textContent?.trim())
    expect(labels()).toEqual([
      'Multiple choice',
      'Type the answer',
      'Closest number',
      'Slider',
      'Pick all that apply',
      'Put in order',
      'Match them up',
    ])
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
    await fireEvent.click(screen.getByRole('radio', { name: 'Medium' }))
    await type('Your name', 'AFKFisher')
    await fireEvent.click(screen.getByRole('button', { name: 'Send to Reldo' }))
    expect(vi.mocked(api.sendSuggestion).mock.calls[0]![0].content).toMatchObject({
      type: 'ordering',
      mode: 'bestiary',
      payload: { ends: ['Lowest', 'Highest'], answer: [0, 1, 2] },
    })
  })

  it('writes a Drop Table matching with names, no pictures, and sends it', async () => {
    played()
    renderSuggest(null, navigate)
    await fireEvent.click(await screen.findByRole('button', { name: /Drop Table/ }))
    await fireEvent.click(screen.getByLabelText('Match them up'))
    expect(screen.queryByLabelText('Picture of field 1')).toBeNull()
    await type('Question', 'Match each drop to the monster that drops it.')
    const pairs = [
      ['Abyssal whip', 'Abyssal demon'],
      ['Dragon warhammer', 'Lizardman shaman'],
      ['Granite maul', 'Gargoyle'],
    ]
    for (const [i, [drop, monster]] of pairs.entries()) {
      await type(`Field ${i + 1}`, drop!)
      await type(`Answer for field ${i + 1}`, monster!)
    }
    const preview = within(screen.getByRole('region', { name: 'Preview' }))
    expect(preview.getByText('Dragon warhammer')).toBeTruthy()
    await type('Relevant Wiki page', 'https://oldschool.runescape.wiki/w/Slayer')
    await fireEvent.click(screen.getByRole('radio', { name: 'Medium' }))
    await type('Your name', 'AFKFisher')
    await fireEvent.click(screen.getByRole('button', { name: 'Send to Reldo' }))
    expect(vi.mocked(api.sendSuggestion).mock.calls[0]![0].content).toMatchObject({
      type: 'matching',
      mode: 'drop_table',
      payload: {
        fields: pairs.map(([text]) => ({ text })),
        options: pairs.map(([, text]) => ({ text })),
        answer: [0, 1, 2],
      },
    })
  })

  it('writes a Bestiary sort into bins, previewed as bins, and sends it', async () => {
    played()
    renderSuggest(null, navigate)
    await fireEvent.click(await screen.findByRole('button', { name: /Bestiary/ }))
    await fireEvent.click(screen.getByLabelText('Match them up'))
    await fireEvent.click(screen.getByLabelText('Sort into bins'))
    await type('Question', 'Which slayer master assigns each?')
    const masters = ['Turael', 'Mazchna', 'Vannaka']
    for (const [i, master] of masters.entries()) await type(`Bin ${i + 1}`, master)
    const monsters = ['Banshee', 'Cave crawler', 'Ghoul', 'Kalphite']
    for (const [i, monster] of monsters.entries()) {
      await type(`Entry ${i + 1}`, monster)
      await fireEvent.change(screen.getByLabelText(`Bin of entry ${i + 1}`), {
        target: { value: String([0, 0, 1, 2][i]) },
      })
    }
    const preview = within(screen.getByRole('region', { name: 'Preview' }))
    expect(preview.getByText('Tap one, then its bin, or drag it there')).toBeTruthy()
    await type('Relevant Wiki page', 'https://oldschool.runescape.wiki/w/Slayer_Masters')
    await fireEvent.click(screen.getByRole('radio', { name: 'Medium' }))
    await type('Your name', 'AFKFisher')
    await fireEvent.click(screen.getByRole('button', { name: 'Send to Reldo' }))
    expect(vi.mocked(api.sendSuggestion).mock.calls[0]![0].content).toMatchObject({
      type: 'matching',
      mode: 'bestiary',
      payload: {
        bins: true,
        fields: monsters.map((text) => ({ text })),
        options: masters.map((text) => ({ text })),
        answer: [0, 0, 1, 2],
      },
    })
  })

  it('lets an NPC ask an order, with its intro, previewed on the NPC’s card', async () => {
    played()
    renderSuggest(null, navigate)
    await fireEvent.click(await screen.findByRole('button', { name: /A random event question/ }))
    await fireEvent.click(screen.getByLabelText('Put in order'))
    expect(screen.getByLabelText('First end')).toBeTruthy()
    await fireEvent.click(screen.getByRole('button', { name: 'Send to Reldo' }))
    expect(screen.getByText('Pick who asks it.')).toBeTruthy()
    expect(api.sendSuggestion).not.toHaveBeenCalled()

    expect(screen.queryByRole('group', { name: 'How hard is it?' })).toBeNull()
    await fireEvent.click(screen.getByRole('radio', { name: 'Fairy Queen' }))
    await type(/^Intro/, 'Turn the dials, mortal.')
    await type('What are they sorted by?', 'Which letters dial Zanaris, in order?')
    await type('First end', 'First')
    await type('Last end', 'Last')
    await type('Entry 1', 'A')
    await type('Entry 2', 'I')
    await type('Entry 3', 'Q')
    const preview = within(screen.getByRole('region', { name: 'Preview' }))
    expect(preview.getByText('Fairy Queen', { selector: '.name' })).toBeTruthy()
    expect(preview.getByText('Turn the dials, mortal.', { selector: '.lore' })).toBeTruthy()
    await type('Relevant Wiki page', 'https://oldschool.runescape.wiki/w/Fairy_ring')
    await type('Your name', 'AFKFisher')
    await fireEvent.click(screen.getByRole('button', { name: 'Send to Reldo' }))
    expect(vi.mocked(api.sendSuggestion).mock.calls[0]![0].content).toEqual({
      type: 'ordering',
      mode: 'random_event',
      random_event: 'fairy_queen',
      wiki: 'https://oldschool.runescape.wiki/w/Fairy_ring',
      payload: {
        intro: 'Turn the dials, mortal.',
        prompt: 'Which letters dial Zanaris, in order?',
        ends: ['First', 'Last'],
        entries: [
          { text: 'A', rank: 1 },
          { text: 'I', rank: 2 },
          { text: 'Q', rank: 3 },
        ],
        answer: [0, 1, 2],
      },
    })
  })

  it('makes an NPC’s question name its NPC', async () => {
    played()
    renderSuggest(null, navigate)
    await fireEvent.click(await screen.findByRole('button', { name: /A random event question/ }))
    const faces = within(screen.getByRole('radiogroup', { name: 'Who asks it' })).getAllByRole(
      'radio',
    )
    expect(faces.map((face) => face.getAttribute('aria-label'))).not.toContain('A random NPC')
    expect(faces.some((face) => (face as HTMLInputElement).checked)).toBe(false)
    await fireEvent.click(screen.getByRole('button', { name: 'Send to Reldo' }))
    expect(screen.getByText('Pick who asks it.')).toBeTruthy()
  })

  it('offers a question with no round last, its seven types and no more, and sends it with no mode', async () => {
    played()
    renderSuggest(null, navigate)
    const cards = (await screen.findAllByRole('button')).filter((b) => b.closest('.choices'))
    expect(cards.at(-1)?.textContent).toMatch(
      /Not sure where it fits\s*Any question\. Reldo picks its round\./,
    )
    expect(cards.at(-1)?.querySelector('img')?.getAttribute('src')).toBe(npcArt(FALLBACK_NPC).url)
    await fireEvent.click(cards.at(-1)!)
    const labels = within(screen.getByRole('group', { name: 'How players answer' }))
      .getAllByRole('radio')
      .map((radio) => radio.parentElement?.textContent?.trim())
    expect(labels).toEqual([
      'Multiple choice',
      'Type the answer',
      'Closest number',
      'Slider',
      'Pick all that apply',
      'Put in order',
      'Match them up',
    ])
    expect(screen.queryByText('Who asks it')).toBeNull()
    expect(screen.queryByLabelText(/^Quote/)).toBeNull()
    expect(screen.queryByLabelText(/^Intro/)).toBeNull()
    expect(screen.queryByLabelText(/Item to show/)).toBeNull()
    expect(screen.queryByRole('group', { name: 'Already in the game' })).toBeNull()
    expect(
      screen.getByLabelText<HTMLTextAreaElement>('Question', { selector: 'textarea' }).readOnly,
    ).toBe(false)
    expect(api.getReportChoices).not.toHaveBeenCalled()

    await fireEvent.click(screen.getByLabelText('Type the answer'))
    await type('Question', 'Which monster drops the Abyssal whip?')
    await type('Accepted answer 1', 'Abyssal demon')
    await type('Another source, if the wiki can’t show it', 'https://example.com/clip')
    await fireEvent.click(screen.getByRole('radio', { name: 'Medium' }))
    await type('Your name', 'AFKFisher')
    await fireEvent.click(screen.getByRole('button', { name: 'Send to Reldo' }))
    const sent = vi.mocked(api.sendSuggestion).mock.calls[0]![0].content
    expect(sent).toMatchObject({
      type: 'free_text',
      payload: { prompt: 'Which monster drops the Abyssal whip?', accepted: ['Abyssal demon'] },
      source_url: 'https://example.com/clip',
    })
    expect(sent).not.toHaveProperty('mode')
    expect(sent).not.toHaveProperty('random_event')
  })

  describe('a place on the map', () => {
    beforeEach(() => {
      vi.mocked(api.sendSuggestion).mockResolvedValue({ id: 'x' })
    })

    it('is no card on a server without the map', async () => {
      vi.mocked(map.tilesLoad).mockResolvedValueOnce(false)
      played()
      renderSuggest(null, navigate)
      await screen.findByRole('button', { name: /A popular item/ })
      expect(screen.queryByRole('button', { name: /Mark the Map/ })).toBeNull()
    })

    it('needs a box, and fills in the place’s wiki page from its name', async () => {
      played()
      renderSuggest(null, navigate)
      await fireEvent.click(await screen.findByRole('button', { name: /Mark the Map/ }))
      await type(/^Place/, 'Falador')
      expect((screen.getByLabelText(/Relevant Wiki page/) as HTMLInputElement).value).toBe(
        'https://oldschool.runescape.wiki/w/Falador',
      )
      await type('Your name', 'AFKFisher')
      await fireEvent.click(screen.getByRole('radio', { name: 'Medium' }))
      await fireEvent.click(screen.getByRole('button', { name: 'Send to Reldo' }))
      expect(await screen.findByText('Tap the map to mark the place.')).toBeTruthy()
      expect(api.sendSuggestion).not.toHaveBeenCalled()
    })

    it('takes a recon photo with no link, and sends it only with the picture, both ticks and a spot', async () => {
      played()
      renderSuggest(null, navigate)
      await fireEvent.click(await screen.findByRole('button', { name: /KGP Recon/ }))
      expect(screen.queryByLabelText(/Relevant Wiki page/)).toBeNull()
      expect(screen.queryByLabelText(/What players are asked/)).toBeNull()
      await type('The place, as the reveal names it', 'Varrock square')
      await fireEvent.click(screen.getByLabelText(/I took this screenshot myself/))
      await type('Your name', 'AFKFisher')
      await fireEvent.click(screen.getByRole('radio', { name: 'Easy' }))
      await fireEvent.click(screen.getByRole('button', { name: 'Send to Reldo' }))
      expect(await screen.findByText('Add your screenshot.')).toBeTruthy()
      expect(screen.getByText('Tick both, or the photo cannot be used.')).toBeTruthy()
      expect(screen.getByText('Tap the map where you took it.')).toBeTruthy()
      expect(api.sendSuggestion).not.toHaveBeenCalled()
    })

    it('says what a reach is worth as it moves', async () => {
      played()
      renderSuggest(null, navigate)
      await fireEvent.click(await screen.findByRole('button', { name: /Mark the Map/ }))
      const reach = screen.getByLabelText(/Points run out/, { selector: 'input' })
      expect(screen.getByRole('row', { name: /Tiles off/ }).textContent).toContain('50')
      await fireEvent.input(reach, { target: { value: '200' } })
      expect(screen.getByLabelText(/Points run out 200 tiles/)).toBeTruthy()
      expect(screen.getByRole('row', { name: /Points/ }).textContent).toContain('750')
    })
  })

  it('shows the limit when the server refuses the send for it', async () => {
    played()
    vi.mocked(api.sendSuggestion).mockRejectedValue(
      new api.ApiFailure(429, 'rate_limited', 'too many suggestions'),
    )
    renderSuggest(null, navigate)
    await fireEvent.click(await screen.findByRole('button', { name: /A popular item/ }))
    await type(/Item name/, 'Ancient mace')
    await type('Your name', 'AFKFisher')
    vi.mocked(api.getSuggestionAllowance).mockResolvedValue({ left: 0, retry_at: null })
    await fireEvent.click(screen.getByRole('button', { name: 'Send to Reldo' }))
    await waitFor(() => expect(screen.getByText(/Try again later/)).toBeTruthy())
  })

  describe('questions the game already has', () => {
    const SIMILAR_WAIT = { timeout: 3000 }

    async function writeOddOneOut(first: string): Promise<void> {
      played()
      renderSuggest(null, navigate)
      await fireEvent.click(await screen.findByRole('button', { name: /Odd One Out/ }))
      await type('Answer 1', first)
      await type('Answer 2', 'Hazelmere')
      await type('Answer 3', 'Guthan')
      await type('Answer 4', 'Verac')
      await fireEvent.click(screen.getByLabelText('Answer 2 is right'))
    }

    it('shows a match for a copied pack question, and Send still works', async () => {
      vi.mocked(api.findSimilar).mockResolvedValue([
        { mode: 'odd_one_out', label: 'Dharok, Hazelmere', score: 100 },
        { mode: 'bestiary', label: 'Which brother?', score: 64 },
      ])
      await writeOddOneOut('Dharok')
      await screen.findByText('Looks like one we have (100%)', {}, SIMILAR_WAIT)
      const status = document.querySelector('.similar')!
      expect(status.textContent).toContain('Dharok, Hazelmere')
      expect(status.textContent).toContain('Which brother?')
      expect(status.textContent).toContain('(64%)')
      expect(api.findSimilar).toHaveBeenCalledTimes(1)
      expect(api.findSimilar).toHaveBeenCalledWith({
        type: 'multiple_choice',
        payload: {
          prompt: "Which one doesn't belong?",
          options: ['Dharok', 'Hazelmere', 'Guthan', 'Verac'],
          answer_index: 1,
        },
        mode: 'odd_one_out',
      })

      await fireEvent.click(screen.getByRole('radio', { name: 'Medium' }))
      await type('Your name', 'AFKFisher')
      await type('Relevant Wiki page', 'https://oldschool.runescape.wiki/w/Barrows_Brothers')
      const send = screen.getByRole('button', { name: 'Send to Reldo' })
      expect((send as HTMLButtonElement).disabled).toBe(false)
      await fireEvent.click(send)
      expect(api.sendSuggestion).toHaveBeenCalledTimes(1)
      expect(api.findSimilar).toHaveBeenCalledTimes(1)
    })

    it('shows nothing for a new question', async () => {
      await writeOddOneOut('Zezima')
      await waitFor(() => expect(api.findSimilar).toHaveBeenCalled(), SIMILAR_WAIT)
      expect(screen.queryByText(/Looks like one we have/)).toBeNull()
    })

    it('shows nothing when the check is refused', async () => {
      vi.mocked(api.findSimilar).mockRejectedValue(new ApiFailure(429, 'rate_limited', 'slow'))
      await writeOddOneOut('Dharok')
      await waitFor(() => expect(api.findSimilar).toHaveBeenCalled(), SIMILAR_WAIT)
      expect(screen.queryByText(/Looks like one we have/)).toBeNull()
    })
  })

  describe('steps and progress line', () => {
    function stepDots(): string[] {
      const list = screen.getByRole('list', { name: 'Steps' })
      return [...list.querySelectorAll('.node')].map((node) =>
        (node.textContent ?? '').replace(/\s+/g, ' ').trim(),
      )
    }

    it('tracks steps with checkmarks, one Optional badge on Extras, and marks missing steps on send', async () => {
      played()
      renderSuggest(null, navigate)
      await fireEvent.click(await screen.findByRole('button', { name: /Drop Table/ }))

      expect(stepDots()).toEqual([
        '1 Question',
        '2 Difficulty',
        '3 Extras (optional)',
        '4 Source',
        '5 Credit',
      ])
      expect(screen.getAllByText('Optional')).toHaveLength(1)

      await fireEvent.click(screen.getByRole('button', { name: 'Send to Reldo' }))
      expect(stepDots()).toEqual([
        '! Question',
        '! Difficulty',
        '3 Extras (optional)',
        '! Source',
        '! Credit',
      ])
      expect(screen.getByRole('group', { name: 'Question' }).classList.contains('missing')).toBe(
        true,
      )
      expect(screen.getByRole('group', { name: 'Difficulty' }).classList.contains('missing')).toBe(
        true,
      )
      expect(screen.getByRole('group', { name: 'Extras' }).classList.contains('missing')).toBe(
        false,
      )
      expect(screen.getByRole('group', { name: 'Source' }).classList.contains('missing')).toBe(true)
      expect(screen.getByRole('group', { name: 'Credit' }).classList.contains('missing')).toBe(true)

      await type('Question', 'Which monster drops the Abyssal whip?')
      await type('Answer 1', 'Abyssal demon')
      await type('Answer 2', 'Greater demon')
      expect(stepDots()).toEqual([
        '✓ Question',
        '! Difficulty',
        '3 Extras (optional)',
        '! Source',
        '! Credit',
      ])
      expect(screen.getByRole('group', { name: 'Question' }).classList.contains('done')).toBe(true)
      expect(screen.getByRole('group', { name: 'Question' }).classList.contains('missing')).toBe(
        false,
      )

      await fireEvent.click(screen.getByRole('radio', { name: 'Medium' }))
      expect(stepDots()).toEqual([
        '✓ Question',
        '✓ Difficulty',
        '3 Extras (optional)',
        '! Source',
        '! Credit',
      ])
      expect(screen.getByRole('group', { name: 'Difficulty' }).classList.contains('done')).toBe(
        true,
      )
      expect(screen.getByRole('group', { name: 'Difficulty' }).classList.contains('missing')).toBe(
        false,
      )

      await type('Item to show, if any', 'Abyssal whip')
      expect(stepDots()).toEqual([
        '✓ Question',
        '✓ Difficulty',
        '✓ Extras (optional)',
        '! Source',
        '! Credit',
      ])
      expect(screen.getByRole('group', { name: 'Extras' }).classList.contains('done')).toBe(true)

      await type('Relevant Wiki page', 'https://oldschool.runescape.wiki/w/Abyssal_demon')
      expect(stepDots()).toEqual([
        '✓ Question',
        '✓ Difficulty',
        '✓ Extras (optional)',
        '✓ Source',
        '! Credit',
      ])

      await type('Your name', 'AFKFisher')
      expect(stepDots()).toEqual([
        '✓ Question',
        '✓ Difficulty',
        '✓ Extras (optional)',
        '✓ Source',
        '✓ Credit',
      ])
    })

    it('omits Extras for rounds without optional fields, and shows two steps for an item', async () => {
      played()
      renderSuggest(null, navigate)
      await fireEvent.click(await screen.findByRole('button', { name: /Guess the Examine/ }))
      expect(stepDots()).toEqual(['1 Question', '2 Difficulty', '3 Wiki page', '4 Credit'])
      expect(screen.queryByRole('group', { name: 'Extras' })).toBeNull()

      await fireEvent.click(screen.getByRole('button', { name: /All suggestion types/ }))
      await fireEvent.click(await screen.findByRole('button', { name: /A popular item/ }))
      expect(stepDots()).toEqual(['1 Item', '2 Credit'])
      await fireEvent.click(screen.getByRole('button', { name: 'Send to Reldo' }))
      expect(stepDots()).toEqual(['! Item', '! Credit'])
      await type(/Item name/, 'Ancient mace')
      expect(stepDots()).toEqual(['✓ Item', '! Credit'])
    })
  })
})
