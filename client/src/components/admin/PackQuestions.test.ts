/** The Questions tab: the packs read whole, edits and deletes queued, then download and applied. */

import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as admin from '../../lib/admin'
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
  vi.mocked(admin.deletePackQuestion).mockResolvedValue(change({ action: 'delete', question: null }))
  vi.mocked(admin.discardQuestionChange).mockResolvedValue()
  vi.mocked(admin.exportQuestionChanges).mockResolvedValue({ edits: [], deletes: [] })
  vi.mocked(admin.markQuestionChangesApplied).mockResolvedValue(1)
})

afterEach(() => cleanup())

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
    await fireEvent.input(screen.getByLabelText(/^Picture/), { target: { value: 'https://x.test/a.png' } })
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
})
