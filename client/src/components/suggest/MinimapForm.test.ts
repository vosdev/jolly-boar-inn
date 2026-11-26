/** A spot for Minimap Guesser on `/suggest`: put down on the map, nudged and turned, previewed. */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as api from '../../lib/api'
import { savePastGame } from '../../lib/history'
import type { QuestionContent } from '../../lib/suggestions'
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

// jsdom fetches nothing, so each layer is a sheet that is never drawn on.
vi.mock('../../lib/mapIcons', async (original) => ({
  ...(await original<typeof import('../../lib/mapIcons')>()),
  loadIcons: () =>
    Promise.resolve({ sprites: [], icons: [], sheet: document.createElement('canvas') }),
}))
vi.mock('../../lib/placeNames', async (original) => ({
  ...(await original<typeof import('../../lib/placeNames')>()),
  loadLabels: () =>
    Promise.resolve({ fonts: [], labels: [], glyphs: document.createElement('canvas') }),
}))

const FIELD = 'textarea, input:not([type=radio])'

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
  await fireEvent.click(await screen.findByRole('button', { name: /Minimap Guesser/ }))
}

async function type(label: string | RegExp, text: string): Promise<void> {
  await fireEvent.input(screen.getByLabelText(label, { selector: FIELD }), {
    target: { value: text },
  })
}

async function tapMap(): Promise<void> {
  const map = await waitFor(() => {
    // The form's own map, not the preview's, which may be built first.
    const field = screen.getByText('Where it is').closest('.field')!
    const found = field.querySelector<HTMLElement>('.leaflet-container')
    if (found === null) throw new Error('no map yet')
    return found
  })
  // Enter on the map picks its middle, as a tap there does; jsdom lays nothing out to tap.
  await fireEvent.keyDown(map, { key: 'Enter' })
}

/** What the drawn preview's canvases are turned by, one per minimap on the page. */
function turns(): string[] {
  return [...document.querySelectorAll<HTMLCanvasElement>('canvas.drawn')].map(
    (canvas) => canvas.style.transform,
  )
}

async function send(): Promise<QuestionContent> {
  await type('Your name', 'AFKFisher')
  await fireEvent.click(screen.getByRole('radio', { name: 'Easy' }))
  await fireEvent.click(screen.getByRole('button', { name: 'Send to Reldo' }))
  await waitFor(() => expect(api.sendSuggestion).toHaveBeenCalled())
  return vi.mocked(api.sendSuggestion).mock.calls[0]![0].content as QuestionContent
}

describe('MinimapForm', () => {
  it('needs a spot, and asks the round’s one question', async () => {
    await open()
    await type(/^Place/, 'Varrock Square')
    expect((screen.getByLabelText(/Relevant Wiki page/) as HTMLInputElement).value).toBe(
      'https://oldschool.runescape.wiki/w/Varrock_Square',
    )
    await type('Your name', 'AFKFisher')
    await fireEvent.click(screen.getByRole('radio', { name: 'Easy' }))
    await fireEvent.click(screen.getByRole('button', { name: 'Send to Reldo' }))
    expect(await screen.findByText('Tap the map to put the spot down.')).toBeTruthy()
    expect(api.sendSuggestion).not.toHaveBeenCalled()
    expect(turns()).toEqual([])
  })

  it('puts the spot down where the map is tapped, and the preview follows it', async () => {
    await open()
    await type(/^Place/, 'Varrock Square')
    await tapMap()
    await waitFor(() => expect(turns().length).toBeGreaterThan(0))
    expect(screen.getAllByRole('img', { name: 'The minimap players will see' })).toHaveLength(1)
    await fireEvent.click(screen.getByRole('button', { name: 'One tile north' }))
    await fireEvent.click(screen.getByRole('button', { name: 'One tile east' }))
    const sent = await send()
    const { minimap, targets, prompt } = sent.payload as {
      minimap: { x: number; y: number; angle: number }
      targets: Record<string, unknown>[]
      prompt: string
    }
    expect(prompt).toBe('Where is this?')
    expect(minimap.angle).toBe(0)
    expect(targets).toEqual([
      {
        name: 'Varrock Square',
        min_x: minimap.x - 19,
        max_x: minimap.x + 19,
        min_y: minimap.y - 19,
        max_y: minimap.y + 19,
        round: true,
      },
    ])
  })

  it('turns the minimap, and North turns it back', async () => {
    await open()
    await tapMap()
    await waitFor(() => expect(turns().length).toBeGreaterThan(0))
    const north = screen.getByRole('button', { name: 'North' }) as HTMLButtonElement
    expect(north.disabled).toBe(true)
    await fireEvent.click(screen.getByRole('button', { name: 'Turn left 15°' }))
    expect(screen.getByLabelText('Turned 345°')).toBeTruthy()
    expect(new Set(turns())).toEqual(new Set(['rotate(345deg)']))
    await fireEvent.input(screen.getByLabelText(/^Turned/), { target: { value: '90' } })
    expect(new Set(turns())).toEqual(new Set(['rotate(90deg)']))
    await fireEvent.click(north)
    expect(new Set(turns())).toEqual(new Set(['rotate(0deg)']))
  })
  it('draws the icons on the picker, and its place names only once asked', async () => {
    await open()
    await tapMap()
    const field = screen.getByText('Where it is').closest('.field')!
    await waitFor(() => expect(field.querySelector('.map-icons')).not.toBeNull())
    expect(screen.getByText('Minimap Guesser plays without them.')).toBeTruthy()
    expect(document.querySelector('.map-labels')).toBeNull()
    await fireEvent.click(screen.getByLabelText('Show place names'))
    await waitFor(() => expect(field.querySelector('.map-labels')).not.toBeNull())
    expect(document.querySelectorAll('.map-labels')).toHaveLength(1)
    await fireEvent.click(screen.getByLabelText('Show place names'))
    await waitFor(() => expect(document.querySelector('.map-labels')).toBeNull())
  })
})
