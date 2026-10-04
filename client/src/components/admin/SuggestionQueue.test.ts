/** The operator's queue: what a player typed drawn as text, review, and export then import. */

import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as admin from '../../lib/admin'
import type { QueuedSuggestion } from '../../lib/suggestions'
import SuggestionQueue from './SuggestionQueue.svelte'

vi.mock('../../lib/admin', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../lib/admin')>()
  return {
    ...real,
    getQueue: vi.fn(),
    setSuggestionStatus: vi.fn(),
    editSuggestion: vi.fn(),
    exportSuggestions: vi.fn(),
    markImported: vi.fn(),
  }
})

const WIKI = 'https://oldschool.runescape.wiki/w/Barrows_Brothers'

function row(over: Partial<QueuedSuggestion> = {}): QueuedSuggestion {
  return {
    id: 'one',
    kind: 'question',
    content: {
      type: 'multiple_choice',
      mode: 'odd_one_out',
      wiki: WIKI,
      payload: {
        prompt: '<b>Which</b> is not a Barrows brother?',
        options: ['<i>Dharok</i>', 'Hazelmere'],
        answer_index: 0,
        explanation: '<script>alert(1)</script>',
      },
    },
    credit: 'AFKFisher',
    credit_shown: true,
    status: 'pending',
    created_at: '2026-10-04T10:00:00Z',
    exported_at: null,
    playable: false,
    ...over,
  }
}

const COUNTS = { pending: 1, approved: 0, rejected: 0, imported: 0 }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(admin.getQueue).mockResolvedValue({ suggestions: [row()], counts: COUNTS })
  vi.mocked(admin.setSuggestionStatus).mockResolvedValue(row({ status: 'approved' }))
  vi.mocked(admin.exportSuggestions).mockResolvedValue({ questions: [], examines: [], items: [] })
  vi.mocked(admin.markImported).mockResolvedValue(1)
})

afterEach(cleanup)

describe('SuggestionQueue', () => {
  it('draws markup a player typed as text', async () => {
    const { container } = render(SuggestionQueue, { token: 't', onrefused: vi.fn() })
    const summary = await screen.findByText('<b>Which</b> is not a Barrows brother?')
    await fireEvent.click(summary.closest('button')!)
    expect(screen.getByText('<i>Dharok</i>', { selector: 'strong' })).toBeTruthy()
    expect(screen.getByText('<script>alert(1)</script>')).toBeTruthy()
    expect(container.querySelector('.detail b, .detail i, .detail script')).toBeNull()
    expect(screen.getByText('Waits for its round')).toBeTruthy()
  })

  it('links the page to check it against, and approves it', async () => {
    render(SuggestionQueue, { token: 't', onrefused: vi.fn() })
    await fireEvent.click((await screen.findByText(/is not a Barrows brother/)).closest('button')!)
    const link = screen.getByRole('link', { name: new RegExp(WIKI) })
    expect(link.getAttribute('href')).toBe(WIKI)
    expect(link.getAttribute('target')).toBe('_blank')
    await fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    expect(admin.setSuggestionStatus).toHaveBeenCalledWith('t', 'one', 'approved')
  })

  it('exports the approved ones, then marks what was exported as imported', async () => {
    const createObjectURL = vi.fn(() => 'blob:x')
    Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const approved = { ...COUNTS, pending: 0, approved: 1 }
    vi.mocked(admin.getQueue).mockResolvedValue({
      suggestions: [row({ status: 'approved', playable: true })],
      counts: approved,
    })
    render(SuggestionQueue, { token: 't', onrefused: vi.fn() })
    await fireEvent.click(await screen.findByRole('tab', { name: /Approved/ }))

    vi.mocked(admin.getQueue).mockResolvedValue({
      suggestions: [row({ status: 'approved', playable: true, exported_at: '2026-10-04T11:00:00Z' })],
      counts: approved,
    })
    await fireEvent.click(await screen.findByRole('button', { name: 'Export 1 approved' }))
    expect(admin.exportSuggestions).toHaveBeenCalledWith('t', 'approved')
    expect(click).toHaveBeenCalled()

    const mark = await screen.findByRole('button', { name: 'Mark 1 as imported' })
    await fireEvent.click(mark)
    expect(admin.markImported).toHaveBeenCalledWith('t')
    click.mockRestore()
  })

  it('hands a refused token back to the page', async () => {
    const onrefused = vi.fn()
    vi.mocked(admin.getQueue).mockRejectedValue(
      new (await import('../../lib/api')).ApiFailure(401, 'unauthorized', 'no'),
    )
    render(SuggestionQueue, { token: 't', onrefused })
    await vi.waitFor(() => expect(onrefused).toHaveBeenCalled())
    expect(within(document.body).queryByRole('list')).toBeNull()
  })
})
