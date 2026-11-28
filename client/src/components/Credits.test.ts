/** The credits sheet: the opted-in authors ranked by count, the way to suggest, and the wiki's thanks. */

import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as api from '../lib/api'
import Credits from './Credits.svelte'

vi.mock('../lib/api', async (importOriginal) => {
  const real = await importOriginal<typeof import('../lib/api')>()
  return { ...real, getCredits: vi.fn() }
})

const onclose = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(cleanup)

function rows(): string[][] {
  const body = screen.getByRole('table').querySelector('tbody') as HTMLElement
  return within(body)
    .getAllByRole('row')
    .map((row) =>
      within(row)
        .getAllByRole('cell')
        .map((cell) => cell.textContent ?? ''),
    )
}

describe('Credits', () => {
  it('ranks the authors by questions, a tie sharing its rank', async () => {
    vi.mocked(api.getCredits).mockResolvedValue({
      authors: [
        { name: 'Tayka', questions: 17 },
        { name: 'AFKFisher', questions: 3 },
        { name: 'Zezima', questions: 3 },
        { name: 'Woox', questions: 1 },
      ],
    })
    render(Credits, { onclose })
    await screen.findByRole('table')
    expect(rows()).toEqual([
      ['1', 'Tayka', '17'],
      ['2', 'AFKFisher', '3'],
      ['2', 'Zezima', '3'],
      ['4', 'Woox', '1'],
    ])
  })

  it('says so when nobody is named yet', async () => {
    vi.mocked(api.getCredits).mockResolvedValue({ authors: [] })
    render(Credits, { onclose })
    expect(await screen.findByText('No player-written questions yet.')).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('shows the failure when the authors do not load', async () => {
    vi.mocked(api.getCredits).mockRejectedValue(
      new api.ApiFailure(0, 'unreachable', 'cannot reach the server'),
    )
    render(Credits, { onclose })
    expect((await screen.findByText(/cannot reach the server/)).textContent).toContain(
      'cannot reach the server',
    )
  })

  it('leads to /suggest from the authors, in a new tab', async () => {
    vi.mocked(api.getCredits).mockResolvedValue({ authors: [] })
    render(Credits, { onclose })
    const link = screen.getByRole('link', { name: 'Suggest a question →' })
    expect(link.getAttribute('href')).toBe('/suggest')
    expect(link.getAttribute('target')).toBe('_blank')
  })

  it('closes on Close and on Escape', async () => {
    vi.mocked(api.getCredits).mockResolvedValue({ authors: [] })
    render(Credits, { onclose })
    await fireEvent.click(screen.getAllByRole('button', { name: 'Close' }).at(-1)!)
    await fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))
    expect(onclose).toHaveBeenCalledTimes(2)
  })

  it('keeps Close below the thanks that scroll, not at their end', async () => {
    vi.mocked(api.getCredits).mockResolvedValue({ authors: [] })
    render(Credits, { onclose })
    const close = screen.getAllByRole('button', { name: 'Close' }).at(-1)!
    expect(close.closest('.foot')).toBeTruthy()
    expect(close.closest('.body')).toBeNull()
  })

  it('thanks the OSRS Wiki and links it in a new tab', async () => {
    vi.mocked(api.getCredits).mockResolvedValue({ authors: [] })
    render(Credits, { onclose })
    expect(screen.getByRole('heading', { name: 'The OSRS Wiki' })).toBeTruthy()
    const link = screen.getByRole('link', { name: 'oldschool.runescape.wiki' })
    expect(link.getAttribute('href')).toBe('https://oldschool.runescape.wiki')
    expect(link.getAttribute('target')).toBe('_blank')
  })
})
