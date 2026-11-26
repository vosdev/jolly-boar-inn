/** A recon photo on `/suggest`: the screenshot is cut to 16:9, the player picking the part. */

import { cleanup, fireEvent, screen, waitFor } from '@testing-library/svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as api from '../../lib/api'
import { savePastGame } from '../../lib/history'
import * as crop from '../../lib/photoCrop'
import * as picture from '../../lib/suggestPicture'
import { renderSuggest } from '../../test-suggest'

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

// jsdom draws no picture and has no canvas, so reading and cutting one give fixed results.
vi.mock('../../lib/suggestPicture', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../lib/suggestPicture')>()
  return { ...real, readPicture: vi.fn() }
})
vi.mock('../../lib/photoCrop', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../lib/photoCrop')>()
  return { ...real, cut: vi.fn() }
})

const FIELD = 'textarea, input:not([type=radio])'

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  savePastGame({ code: 'ABYSSAL', finishedAt: '2026-10-01T20:05:00Z', standings: [], youId: null })
  vi.mocked(api.getSuggestionAllowance).mockResolvedValue({ left: 10, retry_at: null })
  vi.mocked(api.findSimilar).mockResolvedValue([])
  vi.mocked(api.getReportChoices).mockResolvedValue({ by: 'question', choices: [] })
  vi.mocked(api.tryQuestion).mockRejectedValue(new api.ApiFailure(0, 'unreachable', 'offline'))
  vi.mocked(picture.readPicture).mockResolvedValue({
    url: 'blob:whole',
    encoded: 'd2hvbGU=',
    width: 1000,
    height: 1000,
  })
  vi.mocked(crop.cut).mockResolvedValue({
    url: 'blob:cut',
    encoded: 'Y3V0',
    width: 992,
    height: 558,
  })
})

afterEach(cleanup)

async function attach(): Promise<void> {
  renderSuggest()
  await fireEvent.click(await screen.findByRole('button', { name: /KGP Recon/ }))
  const file = new File(['x'], 'shot.png', { type: 'image/png' })
  await fireEvent.change(screen.getByLabelText('Your screenshot', { selector: FIELD }), {
    target: { files: [file] },
  })
}

describe('PhotoForm', () => {
  it('offers the photos’ places on the picker once the round has some, and a full screen map', async () => {
    renderSuggest()
    await fireEvent.click(await screen.findByRole('button', { name: /KGP Recon/ }))
    expect(screen.getByRole('button', { name: 'Full screen map' })).toBeTruthy()
    expect(screen.queryByLabelText('Show places already in the game')).toBeNull()
    cleanup()
    vi.mocked(api.getReportChoices).mockResolvedValue({
      by: 'question',
      choices: [
        {
          id: 'a',
          label: 'Where was this photo taken?',
          picture: 'a1b2c3d4e5f60718.webp',
          places: [{ name: 'Varrock', min_x: 3200, max_x: 3210, min_y: 3400, max_y: 3410 }],
        },
      ],
    })
    renderSuggest()
    await fireEvent.click(await screen.findByRole('button', { name: /KGP Recon/ }))
    expect(await screen.findByLabelText('Show places already in the game')).toBeTruthy()
  })

  it('asks for both ticks before the upload', async () => {
    renderSuggest()
    await fireEvent.click(await screen.findByRole('button', { name: /KGP Recon/ }))
    const ticks = screen.getByRole('group', { name: 'Before you upload' })
    const upload = screen.getByLabelText('Your screenshot', { selector: FIELD })
    expect(ticks.compareDocumentPosition(upload) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(ticks.querySelectorAll('input[type=checkbox]')).toHaveLength(2)
  })

  it('cuts the screenshot to its largest 16:9 middle, and shows the cut', async () => {
    await attach()
    await waitFor(() => expect(crop.cut).toHaveBeenCalled())
    expect(crop.cut).toHaveBeenCalledWith('blob:whole', { x: 4, y: 221, width: 992, height: 558 })
    expect(screen.getByRole('img', { name: 'Your screenshot, whole' }).getAttribute('src')).toBe(
      'blob:whole',
    )
    await waitFor(() =>
      expect(screen.getByRole('img', { name: 'Your screenshot' }).getAttribute('src')).toBe(
        'blob:cut',
      ),
    )
  })

  it('cuts again, smaller, when the player keeps less', async () => {
    await attach()
    await waitFor(() => expect(crop.cut).toHaveBeenCalledTimes(1))
    const keep = screen.getByLabelText('How much to keep')
    await fireEvent.input(keep, { target: { value: '0.5' } })
    await fireEvent.change(keep)
    await waitFor(() => expect(crop.cut).toHaveBeenCalledTimes(2))
    const [, smaller] = vi.mocked(crop.cut).mock.calls[1]!
    expect(smaller.width / 16).toBe(smaller.height / 9)
    expect(smaller.width).toBeLessThan(992)
  })

  it('refuses a screenshot too narrow for a 16:9 photo', async () => {
    vi.mocked(picture.readPicture).mockResolvedValue({
      url: 'blob:tall',
      encoded: 'dGFsbA==',
      width: 300,
      height: 1000,
    })
    await attach()
    expect(await screen.findByText('That picture is too small for a 16:9 photo.')).toBeTruthy()
    expect(crop.cut).not.toHaveBeenCalled()
  })
})
