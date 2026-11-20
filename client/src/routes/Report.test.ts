/** `/report`: only after a game, the limit before any field, and each kind as the server takes it. */

import { cleanup, fireEvent, render, screen } from '@testing-library/svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as api from '../lib/api'
import { savePastGame } from '../lib/history'
import { REPORT_TEXT_MAX } from '../lib/reports'
import Report from './Report.svelte'

vi.mock('../lib/api', async (importOriginal) => {
  const real = await importOriginal<typeof import('../lib/api')>()
  return {
    ...real,
    getReportAllowance: vi.fn(),
    getReportModes: vi.fn(),
    getReportChoices: vi.fn(),
    sendReport: vi.fn(),
  }
})

const navigate = vi.fn()

function played(): void {
  savePastGame({ code: 'ABYSSAL', finishedAt: '2026-10-01T20:05:00Z', standings: [], youId: null })
}

const EXAMINES = [
  { id: 'q_1', label: 'The lowest maintenance pet you will ever have.' },
  { id: 'q_2', label: 'A <b>bold</b> examine.' },
]

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  vi.mocked(api.getReportAllowance).mockResolvedValue({ left: 3, retry_at: null })
  vi.mocked(api.getReportModes).mockResolvedValue(['more_less', 'guess_examine', 'random_event'])
  vi.mocked(api.getReportChoices).mockImplementation(async (mode) =>
    mode === 'more_less'
      ? { by: 'item', choices: [{ id: 4151, label: 'Abyssal whip' }] }
      : { by: 'question', choices: EXAMINES },
  )
  vi.mocked(api.sendReport).mockResolvedValue({ id: 'x' })
})

afterEach(cleanup)

async function round(name: string): Promise<void> {
  await fireEvent.click(await screen.findByRole('button', { name }))
  await screen.findByRole('combobox')
}

async function search(typed: string, option: string): Promise<void> {
  const box = screen.getByRole('combobox')
  await fireEvent.focus(box)
  await fireEvent.input(box, { target: { value: typed } })
  await fireEvent.click(screen.getByRole('option', { name: option }))
}

async function write(text: string): Promise<void> {
  await fireEvent.input(screen.getByLabelText('What is wrong with it?'), {
    target: { value: text },
  })
}

const send = () => fireEvent.click(screen.getByRole('button', { name: 'Send report' }))

describe('Report', () => {
  it('asks for a game first, and asks the server nothing', () => {
    render(Report, { navigate })
    expect(screen.getByText(/Play a game first/)).toBeTruthy()
    expect(api.getReportAllowance).not.toHaveBeenCalled()
  })

  it('says the limit is reached before showing a single field', async () => {
    played()
    const retry = new Date(Date.now() + 22 * 60_000 + 5_000).toISOString()
    vi.mocked(api.getReportAllowance).mockResolvedValue({ left: 0, retry_at: retry })
    render(Report, { navigate })
    await screen.findByText(/Try again in 23 minutes/)
    expect(screen.queryByRole('button', { name: 'Guess the Examine' })).toBeNull()
    expect(api.getReportModes).not.toHaveBeenCalled()
  })

  it('finds a question by a word in it and sends it with the text trimmed', async () => {
    played()
    render(Report, { navigate })
    await round('Guess the Examine')
    expect(api.getReportChoices).toHaveBeenCalledWith('guess_examine')
    await search('maint', 'The lowest maintenance pet you will ever have.')
    await write('  It is the cat, not the dog.  ')
    await send()
    expect(api.sendReport).toHaveBeenCalledWith({
      mode: 'guess_examine',
      question: 'q_1',
      text: 'It is the cat, not the dog.',
    })
    await screen.findByText(/we'll look into it/)
  })

  it('draws a question as text and reports a price round by item', async () => {
    played()
    const { container } = render(Report, { navigate })
    await round('Guess the Examine')
    await fireEvent.focus(screen.getByRole('combobox'))
    expect(screen.getByRole('option', { name: 'A <b>bold</b> examine.' })).toBeTruthy()
    expect(container.querySelector('[role="option"] b')).toBeNull()

    await fireEvent.click(screen.getByRole('button', { name: /All rounds/ }))
    await round('More or Less')
    expect(screen.getByLabelText('Which item?')).toBeTruthy()
    await search('whip', 'Abyssal whip')
    await write('The price is far off.')
    await send()
    expect(api.sendReport).toHaveBeenCalledWith({
      mode: 'more_less',
      item: 4151,
      text: 'The price is far off.',
    })
  })

  it('sends something else with no question, and refuses an empty or overlong text', async () => {
    played()
    render(Report, { navigate })
    await round('Random events')
    await send()
    expect(screen.getByText('Select the question, or choose "Something else".')).toBeTruthy()
    expect(screen.getByText('Required: what is wrong with it.')).toBeTruthy()

    await search('', 'Something else')
    await write('x'.repeat(REPORT_TEXT_MAX + 1))
    await send()
    expect(screen.getByText(`At most ${REPORT_TEXT_MAX} characters.`)).toBeTruthy()
    expect(api.sendReport).not.toHaveBeenCalled()

    await write('Bob asks two questions that are the same.')
    await send()
    expect(api.sendReport).toHaveBeenCalledWith({
      mode: 'random_event',
      text: 'Bob asks two questions that are the same.',
    })
  })

  it('says so when the server refuses one over the limit', async () => {
    played()
    vi.mocked(api.sendReport).mockRejectedValue(
      new api.ApiFailure(429, 'rate_limited', 'too many reports'),
    )
    render(Report, { navigate })
    await round('Random events')
    await search('', 'Something else')
    await write('Something is off.')
    vi.mocked(api.getReportAllowance).mockResolvedValue({ left: 0, retry_at: null })
    await send()
    await screen.findByText(/hourly limit for reports/)
  })
})
