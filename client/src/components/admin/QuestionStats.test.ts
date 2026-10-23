/** The Questions tab's Stats view: the table, its filters, and Set queueing a tier edit. */

import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as admin from '../../lib/admin'
import type { QuestionChange } from '../../lib/questionEdits'
import type { QuestionStats } from '../../lib/questionStats'
import type { PackQuestion } from '../../lib/reports'
import PackQuestions from './PackQuestions.svelte'

vi.mock('../../lib/admin', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../lib/admin')>()
  return {
    ...real,
    getEditModes: vi.fn(),
    getPackQuestions: vi.fn(),
    getQuestionChanges: vi.fn(),
    getQuestionStats: vi.fn(),
    editPackQuestion: vi.fn(),
    discardQuestionChange: vi.fn(),
  }
})

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
    prompt: 'Which dragon sleeps on Ungael?',
    options: ['Vorkath', 'Galvek'],
    answer_index: 0,
  },
  difficulty: 'hard',
  wiki: WIKI,
}

const JAD: PackQuestion = {
  id: 'q_jad',
  type: 'free_text',
  mode: 'drop_table',
  payload: { prompt: 'Who waits in the Fight Cave?', accepted: ['TzTok-Jad'] },
  difficulty: 'easy',
}

const BREAD: PackQuestion = {
  id: 'q_bread',
  type: 'multiple_choice',
  mode: 'random_event',
  random_event: 'sandwich_lady',
  payload: { prompt: 'Which bread is it?', options: ['Baguette', 'Roll'], answer_index: 0 },
}

function stats(question: PackQuestion, over: Partial<QuestionStats> = {}): QuestionStats {
  return {
    question,
    answers: 40,
    credit_sum: 20,
    correct: 20,
    unanswered: 0,
    games: 5,
    ...over,
  }
}

// Vorkath: 80% on a hard choice question, past 70 but not 90, so medium.
const ROWS = [
  stats(JAD, { answers: 10, credit_sum: 1, games: 2, unanswered: 10 }),
  stats(VORKATH, { credit_sum: 32 }),
  stats(BREAD),
]

function pending(over: Partial<QuestionChange> = {}): QuestionChange {
  return {
    question_id: VORKATH.id,
    mode: 'bestiary',
    action: 'edit',
    question: { ...VORKATH, difficulty: 'medium' },
    before: VORKATH,
    updated_at: '2026-10-23T10:00:00Z',
    exported_at: null,
    in_packs: true,
    ...over,
  }
}

async function showStats(changes: QuestionChange[] = []): Promise<HTMLElement> {
  vi.mocked(admin.getQuestionChanges).mockResolvedValue(changes)
  render(PackQuestions, { token: 't', onrefused: vi.fn() })
  const panel = await screen.findByRole('region', { name: 'Pack questions' })
  await fireEvent.click(within(panel).getByRole('button', { name: 'Stats' }))
  await within(panel).findByText('Which dragon sleeps on Ungael?')
  return panel
}

function rowOf(panel: HTMLElement, prompt: string): HTMLElement {
  return within(panel).getByText(prompt).closest('tr') as HTMLElement
}

function prompts(panel: HTMLElement): string[] {
  return [...panel.querySelectorAll('tbody .prompt')].map((cell) => cell.textContent ?? '')
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(admin.getEditModes).mockResolvedValue(['bestiary', 'drop_table', 'random_event'])
  vi.mocked(admin.getPackQuestions).mockResolvedValue([VORKATH])
  vi.mocked(admin.getQuestionStats).mockResolvedValue(ROWS)
  vi.mocked(admin.editPackQuestion).mockResolvedValue(pending())
  vi.mocked(admin.discardQuestionChange).mockResolvedValue()
})

afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('QuestionStats', () => {
  it('shows each question’s answers, scored share, no-answer share and suggestion', async () => {
    const panel = await showStats()
    const vorkath = within(rowOf(panel, 'Which dragon sleeps on Ungael?'))
    expect(vorkath.getByText('80%')).toBeTruthy()
    expect(vorkath.getByRole('img').getAttribute('aria-label')).toBe(
      '80% scored; its band is 0 to 70%',
    )
    expect(vorkath.getByText('Medium')).toBeTruthy()
    const jad = rowOf(panel, 'Who waits in the Fight Cave?')
    expect(jad.classList.contains('dim')).toBe(true)
    expect(within(jad).getByText('Too few answers')).toBeTruthy()
    expect(within(jad).getByText('50%').classList.contains('warn')).toBe(true)
    expect(within(rowOf(panel, 'Which bread is it?')).queryByRole('button')).toBeNull()
  })

  it('sorts the furthest from its band first, and filters by round, tier and suggestions', async () => {
    const panel = await showStats()
    expect(prompts(panel)[0]).toBe('Which dragon sleeps on Ungael?')
    await fireEvent.change(within(panel).getByLabelText('Round'), {
      target: { value: 'drop_table' },
    })
    expect(prompts(panel)).toEqual(['Who waits in the Fight Cave?'])
    await fireEvent.change(within(panel).getByLabelText('Round'), { target: { value: '' } })
    await fireEvent.change(within(panel).getByLabelText('Tier'), { target: { value: 'hard' } })
    expect(prompts(panel)).toEqual(['Which dragon sleeps on Ungael?'])
    await fireEvent.change(within(panel).getByLabelText('Tier'), { target: { value: '' } })
    await fireEvent.click(within(panel).getByLabelText('Only suggestions (1)'))
    expect(prompts(panel)).toEqual(['Which dragon sleeps on Ungael?'])
    await fireEvent.change(within(panel).getByLabelText('Sort'), { target: { value: 'answers' } })
    expect(prompts(panel)).toEqual(['Which dragon sleeps on Ungael?'])
  })

  it('queues Set as a tier edit of the question, nothing else changed', async () => {
    const panel = await showStats()
    const row = rowOf(panel, 'Which dragon sleeps on Ungael?')
    await fireEvent.click(within(row).getByRole('button', { name: 'Set' }))
    expect(admin.editPackQuestion).toHaveBeenCalledWith('t', VORKATH.id, {
      payload: VORKATH.payload,
      difficulty: 'medium',
      wiki: WIKI,
    })
    expect(admin.getQuestionChanges).toHaveBeenCalledTimes(2)
  })

  it('sets the tier on top of an edit already waiting', async () => {
    const reworded = { ...VORKATH.payload, prompt: 'Reworded?' }
    const panel = await showStats([
      pending({ question: { ...VORKATH, id: 'q_new', payload: reworded } }),
    ])
    const row = rowOf(panel, 'Which dragon sleeps on Ungael?')
    await fireEvent.click(within(row).getByRole('button', { name: 'Set' }))
    expect(admin.editPackQuestion).toHaveBeenCalledWith('t', VORKATH.id, {
      payload: reworded,
      difficulty: 'medium',
      wiki: WIKI,
    })
  })

  it('shows a queued tier as Set to, with Discard', async () => {
    const panel = await showStats([pending()])
    const row = within(rowOf(panel, 'Which dragon sleeps on Ungael?'))
    expect(row.getByText('Set to Medium')).toBeTruthy()
    expect(row.queryByRole('button', { name: 'Set' })).toBeNull()
    await fireEvent.click(row.getByRole('button', { name: 'Discard' }))
    expect(admin.discardQuestionChange).toHaveBeenCalledWith('t', VORKATH.id)
  })

  it('remembers the view for the next visit', async () => {
    await showStats()
    cleanup()
    vi.mocked(admin.getQuestionChanges).mockResolvedValue([])
    render(PackQuestions, { token: 't', onrefused: vi.fn() })
    const panel = await screen.findByRole('region', { name: 'Pack questions' })
    expect(await within(panel).findByText('Which dragon sleeps on Ungael?')).toBeTruthy()
    expect(within(panel).getByRole('button', { name: 'Stats' }).getAttribute('aria-pressed')).toBe(
      'true',
    )
    expect(within(panel).queryByLabelText('Search')).toBeNull()
  })
})
