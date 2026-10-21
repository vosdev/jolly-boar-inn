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
  vi.mocked(admin.exportSuggestions).mockResolvedValue({ questions: [], items: [] })
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

  describe('a Sort It Out ordering', () => {
    const ordering = row({
      content: {
        type: 'ordering',
        mode: 'sort_it_out',
        wiki: 'https://oldschool.runescape.wiki/w/Crafting',
        payload: {
          prompt: 'Sort the <b>gems</b> by level.',
          ends: ['Lowest', 'Highest'],
          entries: [
            { text: 'Sapphire', rank: 1, detail: 'Level 20' },
            { text: 'Opal', rank: 1 },
            { text: 'Emerald', rank: 2 },
          ],
          answer: [0, 1, 2],
          picks: 2,
        },
      },
      playable: true,
    })

    it('previews the entries shuffled, and gives the reviewer the right order', async () => {
      vi.mocked(admin.getQueue).mockResolvedValue({ suggestions: [ordering], counts: COUNTS })
      render(SuggestionQueue, { token: 't', onrefused: vi.fn() })
      await fireEvent.click(
        (await screen.findByText(/Sort the <b>gems<\/b> by level/)).closest('button')!,
      )
      const preview = screen.getByLabelText('As players will see it')
      expect(preview.textContent).toContain('Sort the <b>gems</b> by level.')
      expect(preview.textContent).toContain('Opal')
      expect(preview.textContent).not.toContain('Level 20')
      expect(
        screen.getByText(/Sapphire \(Level 20\) = Opal → Emerald/, { selector: 'strong' }),
      ).toBeTruthy()
    })

    it('previews a Release Order, which waits for its round', async () => {
      const content = {
        ...(ordering.content as object),
        mode: 'release_order',
      } as typeof ordering.content
      vi.mocked(admin.getQueue).mockResolvedValue({
        suggestions: [{ ...ordering, content, playable: false }],
        counts: COUNTS,
      })
      render(SuggestionQueue, { token: 't', onrefused: vi.fn() })
      await fireEvent.click((await screen.findByText(/Sort the/)).closest('button')!)
      expect(screen.getByText('Waits for its round')).toBeTruthy()
      expect(screen.getByLabelText('As players will see it').textContent).toContain('Opal')
      await fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
      expect(screen.getByLabelText('First end')).toBeTruthy()
    })

    it('edits it in the same form, ties and picks as stored, and saves the ranks', async () => {
      vi.mocked(admin.getQueue).mockResolvedValue({ suggestions: [ordering], counts: COUNTS })
      vi.mocked(admin.editSuggestion).mockResolvedValue(ordering)
      render(SuggestionQueue, { token: 't', onrefused: vi.fn() })
      await fireEvent.click((await screen.findByText(/Sort the/)).closest('button')!)
      await fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
      expect((screen.getByLabelText('Entry 1') as HTMLInputElement).value).toBe('Sapphire')
      const ties = screen.getAllByLabelText('Tied with the one above') as HTMLInputElement[]
      expect(ties.map((box) => box.checked)).toEqual([true, false])
      expect((screen.getByLabelText('Players order') as HTMLSelectElement).value).toBe('2')

      await fireEvent.click(ties[0]!)
      await fireEvent.click(screen.getByRole('button', { name: 'Save' }))
      const [, id, body] = vi.mocked(admin.editSuggestion).mock.calls[0]!
      expect(id).toBe('one')
      const payload = (body.content as unknown as { payload: { entries: { rank: number }[] } })
        .payload
      expect(payload.entries.map((entry) => entry.rank)).toEqual([1, 2, 3])
    })
  })

  it('previews an NPC’s order on their card and edits it in the same form', async () => {
    const event = row({
      content: {
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
      },
      playable: true,
    })
    vi.mocked(admin.getQueue).mockResolvedValue({ suggestions: [event], counts: COUNTS })
    vi.mocked(admin.editSuggestion).mockResolvedValue(event)
    render(SuggestionQueue, { token: 't', onrefused: vi.fn() })
    await fireEvent.click((await screen.findByText(/Which letters dial/)).closest('button')!)
    const preview = screen.getByLabelText('As players will see it')
    expect(within(preview).getByText('Fairy Queen', { selector: '.who' })).toBeTruthy()

    await fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    expect(screen.getByRole('radio', { name: 'Fairy Queen' })).toHaveProperty('checked', true)
    expect((screen.getByLabelText(/^Intro/) as HTMLTextAreaElement).value).toBe(
      'Turn the dials, mortal.',
    )
    await fireEvent.input(screen.getByLabelText(/^Intro/), { target: { value: 'Dial, mortal.' } })
    await fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    const [, id, body] = vi.mocked(admin.editSuggestion).mock.calls[0]!
    expect(id).toBe('one')
    expect(body.content).toMatchObject({
      type: 'ordering',
      random_event: 'fairy_queen',
      payload: { intro: 'Dial, mortal.', answer: [0, 1, 2] },
    })
  })

  it('links a question’s non-wiki source beside, or instead of, its wiki page', async () => {
    const clip = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
    const only = row({
      id: 'clip',
      content: {
        type: 'multiple_choice',
        mode: 'who_said_that',
        source_url: clip,
        payload: {
          prompt: 'Who said this?',
          quote: '<b>Hi</b>',
          options: ['A', 'B'],
          answer_index: 0,
        },
      },
    })
    vi.mocked(admin.getQueue).mockResolvedValue({ suggestions: [only, row()], counts: COUNTS })
    render(SuggestionQueue, { token: 't', onrefused: vi.fn() })
    await fireEvent.click((await screen.findByText('Who said this?')).closest('button')!)
    expect(
      screen.getByRole('link', { name: (name) => name.includes(clip) }).getAttribute('href'),
    ).toBe(clip)
    expect(screen.queryByRole('link', { name: /oldschool/ })).toBeNull()
    expect(
      screen.getByLabelText('As players will see it').querySelector('blockquote')?.textContent,
    ).toBe('<b>Hi</b>')
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
      suggestions: [
        row({ status: 'approved', playable: true, exported_at: '2026-10-04T11:00:00Z' }),
      ],
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
