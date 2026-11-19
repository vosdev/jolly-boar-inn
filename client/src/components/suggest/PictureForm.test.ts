/** A picture pin on `/suggest`: the screenshot goes up with it, and it asks for no source. */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as api from '../../lib/api'
import { savePastGame } from '../../lib/history'
import * as picture from '../../lib/suggestPicture'
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

// jsdom draws no picture, so reading one gives a fixed result.
vi.mock('../../lib/suggestPicture', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../lib/suggestPicture')>()
  return { ...real, readPicture: vi.fn() }
})

const FIELD = 'textarea, input:not([type=radio])'

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  savePastGame({ code: 'ABYSSAL', finishedAt: '2026-10-01T20:05:00Z', standings: [], youId: null })
  vi.mocked(api.getSuggestionAllowance).mockResolvedValue({ left: 10, retry_at: null })
  vi.mocked(api.sendSuggestion).mockResolvedValue({ id: 'x' })
  vi.mocked(api.findSimilar).mockResolvedValue([])
  vi.mocked(api.getReportChoices).mockResolvedValue({ by: 'question', choices: [] })
  vi.mocked(api.tryQuestion).mockRejectedValue(new api.ApiFailure(0, 'unreachable', 'offline'))
  vi.mocked(picture.readPicture).mockResolvedValue({
    url: 'blob:shot',
    encoded: 'UklGRg==',
    width: 800,
    height: 450,
  })
})

afterEach(cleanup)

async function open(): Promise<void> {
  render(Suggest, { navigate: vi.fn() })
  await fireEvent.click(await screen.findByRole('button', { name: /Prop Hunt/ }))
}

async function attach(): Promise<void> {
  const file = new File(['x'], 'shot.png', { type: 'image/png' })
  await fireEvent.change(screen.getByLabelText('Your screenshot', { selector: FIELD }), {
    target: { files: [file] },
  })
  await screen.findByRole('img', { name: 'Your screenshot' })
}

describe('PictureForm', () => {
  it('sends the screenshot with a grid answer, and no source', async () => {
    await open()
    expect(screen.queryByLabelText('Relevant Wiki page')).toBeNull()
    await attach()
    await fireEvent.click(screen.getByRole('radio', { name: 'Pick a cell' }))
    await fireEvent.input(screen.getByLabelText('Columns'), { target: { valueAsNumber: 2 } })
    await fireEvent.input(screen.getByLabelText('Rows'), { target: { valueAsNumber: 3 } })
    await fireEvent.click(screen.getByRole('button', { name: 'Column 2, row 3' }))
    await fireEvent.click(screen.getByRole('radio', { name: 'Medium' }))
    await fireEvent.input(screen.getByLabelText('Your name'), { target: { value: 'AFKFisher' } })
    await fireEvent.click(screen.getByRole('button', { name: 'Send to Reldo' }))
    await waitFor(() => expect(api.sendSuggestion).toHaveBeenCalled())
    expect(api.sendSuggestion).toHaveBeenCalledWith({
      kind: 'question',
      content: {
        type: 'picture_pin',
        mode: 'prop_hunt',
        difficulty: 'medium',
        payload: {
          prompt: 'Which of these is a player in disguise?',
          screenshot: picture.UPLOAD_NAME,
          width: 800,
          height: 450,
          grid: { cols: 2, rows: 3 },
          cells: [{ col: 1, row: 2 }],
        },
      },
      credit: 'AFKFisher',
      credit_shown: false,
      picture: 'UklGRg==',
    })
  })

  it('sends nothing without a screenshot or an answer on it', async () => {
    await open()
    await fireEvent.click(screen.getByRole('radio', { name: 'Medium' }))
    await fireEvent.input(screen.getByLabelText('Your name'), { target: { value: 'AFKFisher' } })
    await fireEvent.click(screen.getByRole('button', { name: 'Send to Reldo' }))
    expect(screen.getByText('Add your screenshot.')).toBeTruthy()
    await attach()
    await fireEvent.click(screen.getByRole('button', { name: 'Send to Reldo' }))
    expect(screen.getByText('Drag a box around the spot.')).toBeTruthy()
    expect(api.sendSuggestion).not.toHaveBeenCalled()
  })

  it('says why a file is refused', async () => {
    vi.mocked(picture.readPicture).mockResolvedValue('That file is over 5 MB.')
    await open()
    const file = new File(['x'], 'shot.png', { type: 'image/png' })
    await fireEvent.change(screen.getByLabelText('Your screenshot', { selector: FIELD }), {
      target: { files: [file] },
    })
    expect(await screen.findByText('That file is over 5 MB.')).toBeTruthy()
  })
})
