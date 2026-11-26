/** A place for Lost in Gielinor on `/suggest`: Hans's description, never the name, and why. */

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as api from '../../lib/api'
import { savePastGame } from '../../lib/history'
import { descriptionProblem, type QuestionContent } from '../../lib/suggestions'
import Suggest from '../../routes/Suggest.svelte'

vi.mock('../../lib/api', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../lib/api')>()
  return {
    ...real,
    getSuggestionAllowance: vi.fn(),
    sendSuggestion: vi.fn(),
    getReportChoices: vi.fn(),
    findSimilar: vi.fn(),
    tryQuestion: vi.fn(),
  }
})

vi.mock('../../lib/map', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../lib/map')>()
  return { ...real, tilesLoad: vi.fn(() => Promise.resolve(true)) }
})

const FIELD = 'textarea, input:not([type=radio])'
const SEES = /^What Hans sees/
const GIVES = /^What gives it away/

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  savePastGame({ code: 'ABYSSAL', finishedAt: '2026-10-01T20:05:00Z', standings: [], youId: null })
  vi.mocked(api.getSuggestionAllowance).mockResolvedValue({ left: 10, retry_at: null })
  vi.mocked(api.findSimilar).mockResolvedValue([])
  vi.mocked(api.getReportChoices).mockResolvedValue({ by: 'question', choices: [] })
  vi.mocked(api.tryQuestion).mockRejectedValue(new api.ApiFailure(0, 'unreachable', 'offline'))
  vi.mocked(api.sendSuggestion).mockResolvedValue({ id: 'x' })
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800)
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

async function open(): Promise<void> {
  render(Suggest, { navigate: vi.fn() })
  await fireEvent.click(await screen.findByRole('button', { name: /Lost in Gielinor/ }))
}

async function type(label: string | RegExp, text: string): Promise<void> {
  await fireEvent.input(screen.getByLabelText(label, { selector: FIELD }), {
    target: { value: text },
  })
}

async function tapMap(): Promise<void> {
  const map = await waitFor(() => {
    const field = screen.getByText('Where it is').closest('.field')!
    const found = field.querySelector<HTMLElement>('.leaflet-container')
    if (found === null) throw new Error('no map yet')
    return found
  })
  await fireEvent.keyDown(map, { key: 'Enter' })
}

async function trySend(): Promise<void> {
  await type('Your name', 'AFKFisher')
  await fireEvent.click(screen.getByRole('radio', { name: 'Easy' }))
  await fireEvent.click(screen.getByRole('button', { name: 'Send to Reldo' }))
}

describe('descriptionProblem', () => {
  it('refuses a word of the name, its plural or possessive, in any case', () => {
    expect(descriptionProblem('I am in FALADOR.', 'Falador')).toBe('It names the place: “falador”.')
    expect(descriptionProblem("Falador's walls.", 'Falador')).not.toBeNull()
    expect(descriptionProblem('So many castles.', 'Falador Castle')).toBe(
      'It names the place: “castle”.',
    )
  })

  it('lets the small words of a name pass, and needs some words', () => {
    expect(descriptionProblem('At the edge of a lake.', 'Isle of the Souls')).toBeNull()
    expect(descriptionProblem('  ', 'Falador')).toBe('Required: what Hans sees.')
  })
})

describe('PlaceForm, described', () => {
  it('sends the description as the question, with its explanation', async () => {
    await open()
    await type(/^Place/, 'Falador')
    await type(SEES, 'Big white walls and knights in white armour.')
    await type(GIVES, 'The White Knights guard Falador.')
    await tapMap()
    await trySend()
    await waitFor(() => expect(api.sendSuggestion).toHaveBeenCalled())
    const sent = vi.mocked(api.sendSuggestion).mock.calls[0]![0].content as QuestionContent
    expect(sent.mode).toBe('lost_in_gielinor')
    expect(sent.payload).toMatchObject({
      prompt: 'Big white walls and knights in white armour.',
      explanation: 'The White Knights guard Falador.',
      targets: [{ name: 'Falador' }],
    })
  })

  it('shows the places already in the game only once asked, beside the new box', async () => {
    vi.mocked(api.getReportChoices).mockResolvedValue({
      by: 'question',
      choices: [
        {
          id: 'a',
          label: 'Big white walls.',
          places: [{ name: 'Falador', min_x: 2935, max_x: 3066, min_y: 3309, max_y: 3395 }],
        },
      ],
    })
    await open()
    await type(/^Place/, 'Catherby')
    await tapMap()
    const field = screen.getByText('Where it is').closest('.field')!
    const box = await screen.findByLabelText('Show places already in the game')
    const names = (): string[] =>
      [...field.querySelectorAll('.map-name')].map((tag) => `${tag.className}:${tag.textContent}`)
    await waitFor(() => expect(names()).toEqual(['map-name:Catherby']))
    await fireEvent.click(box)
    await waitFor(() => expect(names()).toEqual(['map-name:Catherby', 'map-name faint:Falador']))
  })

  it('opens the picker full screen, where a tap puts the box down as on the small map', async () => {
    await open()
    await type(/^Place/, 'Catherby')
    await fireEvent.click(await screen.findByRole('button', { name: 'Full screen map' }))
    const dialog = screen.getByRole('dialog', { name: 'Find it on the map' })
    expect((dialog as HTMLDialogElement).open).toBe(true)
    const big = await waitFor(() => {
      const found = dialog.querySelector<HTMLElement>('.leaflet-container')
      if (found === null) throw new Error('no map yet')
      return found
    })
    expect(dialog.textContent).toContain('Find the place and tap it.')
    await fireEvent.keyDown(big, { key: 'Enter' })
    await waitFor(() => expect(dialog.querySelector('.map-name')?.textContent).toBe('Catherby'))
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
    expect((dialog as HTMLDialogElement).open).toBe(false)
    expect(dialog.querySelector('.leaflet-container')).toBeNull()
    const field = screen.getByText('Where it is').closest('.field')!
    await waitFor(() => expect(field.querySelector('.map-name')?.textContent).toBe('Catherby'))
  })

  it('offers no places when the round has none yet', async () => {
    await open()
    await waitFor(() => expect(api.getReportChoices).toHaveBeenCalled())
    expect(screen.queryByLabelText('Show places already in the game')).toBeNull()
  })

  it('refuses a description naming the place, and one with no explanation', async () => {
    await open()
    await type(/^Place/, 'Falador')
    await type(SEES, 'The castle in Falador.')
    await tapMap()
    await trySend()
    expect(await screen.findByText('It names the place: “falador”.')).toBeTruthy()
    expect(screen.getByText('Required: what gives it away.')).toBeTruthy()
    expect(api.sendSuggestion).not.toHaveBeenCalled()
  })
})
