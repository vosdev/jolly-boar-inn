/** The Questions tab: the packs read whole, edits and deletes queued, then download and applied. */

import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as admin from '../../lib/admin'
import { npcArt } from '../../lib/npcs'
import type { QuestionChange } from '../../lib/questionEdits'
import type { PackQuestion } from '../../lib/reports'
import PackQuestions from './PackQuestions.svelte'

vi.mock('../../lib/admin', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../lib/admin')>()
  return {
    ...real,
    getEditModes: vi.fn(),
    getPackQuestions: vi.fn(),
    getQuestionChanges: vi.fn(),
    editPackQuestion: vi.fn(),
    deletePackQuestion: vi.fn(),
    discardQuestionChange: vi.fn(),
    exportQuestionChanges: vi.fn(),
    markQuestionChangesApplied: vi.fn(),
    downloadJson: vi.fn(),
  }
})

// The renders are not committed, so without this every NPC is the innkeeper's drawing.
vi.mock('../../lib/npcs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/npcs')>()),
  npcArt: (id: string) => ({ url: `/npcs/${id}.png`, cut: 'chathead' }),
}))

const WIKI = 'https://oldschool.runescape.wiki/w/Vorkath'

const VORKATH: PackQuestion = {
  id: 'q_vork',
  type: 'multiple_choice',
  mode: 'bestiary',
  payload: {
    intro: 'A frozen dragon, they say.',
    prompt: 'Which <b>dragon</b> sleeps on Ungael?',
    options: ['Vorkath', 'Galvek'],
    answer_index: 0,
  },
  wiki: WIKI,
}

const JAD: PackQuestion = {
  id: 'q_jad',
  type: 'closest_number',
  mode: 'bestiary',
  payload: { prompt: 'What level is TzTok-Jad?', answer: 702 },
}

const EVENTS: PackQuestion[] = [
  {
    id: 'q_bread',
    type: 'multiple_choice',
    mode: 'random_event',
    random_event: 'sandwich_lady',
    payload: { prompt: 'Which bread is it?', options: ['Baguette', 'Roll'], answer_index: 0 },
  },
  {
    id: 'q_potion',
    type: 'free_text',
    mode: 'random_event',
    random_event: 'dr_jekyll',
    payload: { prompt: 'Name the potion.', answers: ['Elixir'] },
  },
  {
    id: 'q_rat',
    type: 'multiple_choice',
    mode: 'random_event',
    random_event: 'dr_jekyll',
    payload: { prompt: 'Which rat bites?', options: ['Giant rat', 'Rat'], answer_index: 0 },
  },
]

function change(over: Partial<QuestionChange> = {}): QuestionChange {
  return {
    question_id: VORKATH.id,
    mode: 'bestiary',
    action: 'edit',
    question: { ...VORKATH, id: 'q_new', payload: { ...VORKATH.payload, prompt: 'Reworded?' } },
    before: VORKATH,
    updated_at: '2026-10-05T10:00:00Z',
    exported_at: null,
    in_packs: true,
    ...over,
  }
}

function show(changes: QuestionChange[] = []): void {
  vi.mocked(admin.getQuestionChanges).mockResolvedValue(changes)
  render(PackQuestions, { token: 't', onrefused: vi.fn() })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(admin.getEditModes).mockResolvedValue(['bestiary', 'random_event'])
  vi.mocked(admin.getPackQuestions).mockResolvedValue([VORKATH, JAD])
  vi.mocked(admin.editPackQuestion).mockResolvedValue(change())
  vi.mocked(admin.deletePackQuestion).mockResolvedValue(
    change({ action: 'delete', question: null }),
  )
  vi.mocked(admin.discardQuestionChange).mockResolvedValue()
  vi.mocked(admin.exportQuestionChanges).mockResolvedValue({ edits: [], deletes: [] })
  vi.mocked(admin.markQuestionChangesApplied).mockResolvedValue(1)
})

afterEach(() => {
  cleanup()
  localStorage.clear()
})

async function openRandomEvents(): Promise<HTMLElement> {
  vi.mocked(admin.getPackQuestions).mockImplementation(async (_token, mode) =>
    mode === 'random_event' ? EVENTS : [VORKATH, JAD],
  )
  show()
  const list = await screen.findByRole('region', { name: 'Pack questions' })
  await screen.findByText('Which <b>dragon</b> sleeps on Ungael?')
  await fireEvent.change(within(list).getByLabelText('Round'), {
    target: { value: 'random_event' },
  })
  await within(list).findByText('Which bread is it?')
  return list
}

function headings(list: HTMLElement): string[] {
  return within(list)
    .queryAllByRole('heading', { level: 3 })
    .map((heading) => heading.textContent?.replace(/\s+/gu, ' ').trim() ?? '')
}

describe('PackQuestions', () => {
  it("lists the first round's questions, as text, and searches them", async () => {
    show()
    expect(await screen.findByText('Which <b>dragon</b> sleeps on Ungael?')).toBeTruthy()
    expect(document.querySelector('b')).toBeNull()
    expect(admin.getPackQuestions).toHaveBeenCalledWith('t', 'bestiary')
    await fireEvent.input(screen.getByLabelText('Search'), { target: { value: 'tztok' } })
    expect(screen.queryByText('Which <b>dragon</b> sleeps on Ungael?')).toBeNull()
    expect(screen.getByText('What level is TzTok-Jad?')).toBeTruthy()
  })

  it('queues an edit with its intro, links and credit, leaving the type and mode out', async () => {
    show()
    await fireEvent.click(await screen.findByText('Which <b>dragon</b> sleeps on Ungael?'))
    await fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    const intro = screen.getByLabelText(/^Intro/)
    expect((intro as HTMLTextAreaElement).value).toBe('A frozen dragon, they say.')
    await fireEvent.input(intro, { target: { value: 'Brr.' } })
    await fireEvent.input(screen.getByLabelText(/^Picture/), { target: { value: 'npc:8061' } })
    await fireEvent.input(screen.getByLabelText('Suggested by'), { target: { value: 'Zezima' } })
    await fireEvent.click(screen.getByRole('button', { name: 'Queue the edit' }))
    expect(admin.editPackQuestion).toHaveBeenCalledWith('t', VORKATH.id, {
      payload: { ...VORKATH.payload, intro: 'Brr.', image: 'npc:8061' },
      wiki: WIKI,
      credit: 'Zezima',
    })
  })

  it('refuses a picture that is not an item or an NPC before anything is sent', async () => {
    show()
    await fireEvent.click(await screen.findByText('Which <b>dragon</b> sleeps on Ungael?'))
    await fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    await fireEvent.input(screen.getByLabelText(/^Picture/), {
      target: { value: 'https://x.test/a.png' },
    })
    await fireEvent.click(screen.getByRole('button', { name: 'Queue the edit' }))
    expect(admin.editPackQuestion).not.toHaveBeenCalled()
  })

  it('queues a delete, which marks the question', async () => {
    show()
    await fireEvent.click(await screen.findByText('What level is TzTok-Jad?'))
    await fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(admin.deletePackQuestion).toHaveBeenCalledWith('t', JAD.id)
  })

  it('shows a pending change before and after, and discards it', async () => {
    show([change()])
    const pending = await screen.findByRole('region', { name: 'Pending changes' })
    const row = await within(pending).findByText('Which <b>dragon</b> sleeps on Ungael?')
    await fireEvent.click(row)
    expect(within(pending).getByText('Reworded?')).toBeTruthy()
    expect(screen.getByText('Edited')).toBeTruthy()
    await fireEvent.click(within(pending).getByRole('button', { name: 'Discard' }))
    expect(admin.discardQuestionChange).toHaveBeenCalledWith('t', VORKATH.id)
  })

  it('edits a question again from its pending edit', async () => {
    show([change()])
    const list = await screen.findByRole('region', { name: 'Pack questions' })
    await fireEvent.click(await within(list).findByText('Which <b>dragon</b> sleeps on Ungael?'))
    await fireEvent.click(within(list).getByRole('button', { name: 'Edit' }))
    expect((screen.getByLabelText('Question') as HTMLTextAreaElement).value).toBe('Reworded?')
  })

  it('downloads the changes, then marks the downloaded ones applied', async () => {
    show([change(), change({ question_id: JAD.id, before: JAD, action: 'delete', question: null })])
    await fireEvent.click(await screen.findByRole('button', { name: 'Download 2 changes' }))
    expect(admin.exportQuestionChanges).toHaveBeenCalledWith('t')
    expect(admin.downloadJson).toHaveBeenCalledWith(
      { edits: [], deletes: [] },
      expect.stringMatching(/^question-changes-\d{4}-\d{2}-\d{2}\.json$/),
    )
    cleanup()
    show([change({ exported_at: '2026-10-05T11:00:00Z' })])
    await fireEvent.click(await screen.findByRole('button', { name: 'Mark 1 as applied' }))
    expect(admin.markQuestionChangesApplied).toHaveBeenCalledWith('t')
  })

  it('says when a change names a question the packs no longer hold', async () => {
    show([change({ in_packs: false })])
    expect(await screen.findByText('No longer in the packs')).toBeTruthy()
  })

  it('groups random events by the NPC who asks, alphabetically, with counts', async () => {
    const list = await openRandomEvents()
    const grouping = within(list).getByLabelText('Group by') as HTMLSelectElement
    expect([...grouping.options].map((option) => option.text)).toEqual(['All', 'Host', 'Type'])
    expect(headings(list)).toEqual([])
    await fireEvent.change(grouping, { target: { value: 'host' } })
    expect(headings(list)).toEqual(['Dr Jekyll 2', 'Sandwich Lady 1'])
    const jekyll = within(list).getByRole('group', { name: /Dr Jekyll/ })
    expect(within(jekyll).getByText('Name the potion.')).toBeTruthy()
    expect(within(jekyll).getByText('Which rat bites?')).toBeTruthy()
    expect(within(jekyll).queryByText('Which bread is it?')).toBeNull()
    expect(jekyll.querySelector('h3 img')?.getAttribute('src')).toBe(npcArt('dr_jekyll').url)
  })

  it('groups by type, and hides a group the search empties', async () => {
    const list = await openRandomEvents()
    await fireEvent.change(within(list).getByLabelText('Group by'), { target: { value: 'type' } })
    expect(headings(list)).toEqual(['Multiple choice 2', 'Type the answer 1'])
    await fireEvent.input(within(list).getByLabelText('Search'), { target: { value: 'potion' } })
    expect(headings(list)).toEqual(['Type the answer 1'])
  })

  it('offers no host outside random events, and no grouping for a single type', async () => {
    show()
    const list = await screen.findByRole('region', { name: 'Pack questions' })
    await screen.findByText('Which <b>dragon</b> sleeps on Ungael?')
    const grouping = within(list).getByLabelText('Group by') as HTMLSelectElement
    expect([...grouping.options].map((option) => option.text)).toEqual(['All', 'Type'])
    cleanup()
    vi.mocked(admin.getPackQuestions).mockResolvedValue([VORKATH])
    show()
    await screen.findByText('Which <b>dragon</b> sleeps on Ungael?')
    expect(screen.queryByLabelText('Group by')).toBeNull()
  })

  it('remembers the grouping, and lists a round that cannot offer it whole', async () => {
    const list = await openRandomEvents()
    await fireEvent.change(within(list).getByLabelText('Group by'), { target: { value: 'host' } })
    cleanup()
    const again = await openRandomEvents()
    expect((within(again).getByLabelText('Group by') as HTMLSelectElement).value).toBe('host')
    expect(headings(again)).toEqual(['Dr Jekyll 2', 'Sandwich Lady 1'])
    await fireEvent.change(within(again).getByLabelText('Round'), { target: { value: 'bestiary' } })
    await within(again).findByText('What level is TzTok-Jad?')
    expect(headings(again)).toEqual([])
  })

  it("shows a pending random event's change with the NPC who asks it", async () => {
    show([change({ question_id: 'q_potion', mode: 'random_event', before: EVENTS[1] })])
    const pending = await screen.findByRole('region', { name: 'Pending changes' })
    await within(pending).findByText('Name the potion.')
    expect(pending.querySelector('img')?.getAttribute('src')).toBe(npcArt('dr_jekyll').url)
  })
})
