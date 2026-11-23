/** The operator's report queue: a player's text drawn as text, snapshots, and closing. */

import { cleanup, fireEvent, render, screen } from '@testing-library/svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as admin from '../../lib/admin'
import type { PackQuestion, QueuedReport } from '../../lib/reports'
import { screenshots } from '../../lib/screenshots.svelte'
import ReportQueue from './ReportQueue.svelte'

vi.mock('../../lib/admin', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../lib/admin')>()
  return { ...real, getReports: vi.fn(), setReportStatus: vi.fn(), getPackQuestions: vi.fn() }
})

const WIKI = 'https://oldschool.runescape.wiki/w/Heroes%27_Guild'

const ODD: PackQuestion = {
  id: 'q_odd',
  type: 'multiple_choice',
  mode: 'odd_one_out',
  payload: {
    prompt: "Which one doesn't belong?",
    options: ['Crafting Guild', "Heroes' Guild", 'Mining Guild'],
    answer_index: 1,
  },
  wiki: WIKI,
}

const SWORDFISH: PackQuestion = {
  id: 'q_fish',
  type: 'more_less',
  mode: 'more_less',
  payload: {
    metric: 'ge_price',
    direction: 'more',
    options: [
      { subject: { name: 'Swordfish', asset: 'item:373' }, value: 248 },
      { subject: { name: 'Monkfish', asset: 'item:7946' }, value: 159 },
    ],
    answer_index: 0,
    as_of: '2026-09-26',
  },
}

const PROP: PackQuestion = {
  id: 'q_prop',
  type: 'picture_pin',
  mode: 'prop_hunt',
  payload: {
    prompt: 'Where is the barrel?',
    screenshot: 'screenshot:barrel',
    width: 1600,
    height: 900,
    target: { min_x: 0.1, max_x: 0.3, min_y: 0.5, max_y: 0.75 },
    reach: 0.1,
  },
}

function report(over: Partial<QueuedReport> = {}): QueuedReport {
  return {
    id: 'one',
    mode: 'odd_one_out',
    question_id: ODD.id,
    snapshot: ODD,
    text: '<script>alert(1)</script> The <b>Heroes</b> one is right.',
    status: 'open',
    created_at: '2026-10-04T10:00:00Z',
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(admin.getReports).mockResolvedValue({
    reports: [report()],
    counts: { open: 1, closed: 0 },
  })
  vi.mocked(admin.getPackQuestions).mockImplementation(async (_, mode) =>
    mode === 'more_less' ? [SWORDFISH] : [ODD],
  )
  vi.mocked(admin.setReportStatus).mockResolvedValue(report({ status: 'closed' }))
})

afterEach(cleanup)

async function openFirst(name: RegExp | string): Promise<void> {
  await fireEvent.click((await screen.findByText(name)).closest('button')!)
}

describe('ReportQueue', () => {
  it('shows a screenshot question by its photo, and the target on it once opened', async () => {
    screenshots.files = { 'screenshot:barrel': 'a1b2c3d4e5f60718.webp' }
    vi.mocked(admin.getReports).mockResolvedValue({
      reports: [report({ mode: 'prop_hunt', question_id: PROP.id, snapshot: PROP })],
      counts: { open: 1, closed: 0 },
    })
    vi.mocked(admin.getPackQuestions).mockResolvedValue([PROP])
    const { container } = render(ReportQueue, { token: 't', onrefused: vi.fn() })
    await screen.findByText('Where is the barrel?')
    const thumb = container.querySelector<HTMLImageElement>('.summary img.shot')
    expect(thumb?.getAttribute('src')).toBe('/pictures/a1b2c3d4e5f60718.webp')
    await openFirst('Where is the barrel?')
    const photo = screen.getByRole('img', { name: "The question's screenshot" })
    expect(photo.getAttribute('src')).toBe('/pictures/a1b2c3d4e5f60718.webp')
    const mark = container.querySelector<HTMLElement>('.shot .mark')!
    expect([mark.style.left, mark.style.top, mark.style.width, mark.style.height]).toEqual([
      '10%',
      '50%',
      '20%',
      '25%',
    ])
    screenshots.files = {}
  })

  it('draws what a player typed as text, beside the question with its answer and wiki', async () => {
    const { container } = render(ReportQueue, { token: 't', onrefused: vi.fn() })
    await openFirst("Crafting Guild, Heroes' Guild, Mining Guild")
    expect(
      screen.getByText('<script>alert(1)</script> The <b>Heroes</b> one is right.'),
    ).toBeTruthy()
    expect(container.querySelector('.detail script, .detail b')).toBeNull()
    expect(screen.getByText("Heroes' Guild", { selector: 'strong' })).toBeTruthy()
    expect(screen.getByRole('link', { name: new RegExp(WIKI) }).getAttribute('href')).toBe(WIKI)
    expect(screen.queryByText('No longer in the pack')).toBeNull()
  })

  it('still shows the snapshot of a question that has left the pack', async () => {
    vi.mocked(admin.getPackQuestions).mockResolvedValue([])
    render(ReportQueue, { token: 't', onrefused: vi.fn() })
    expect(await screen.findByText('No longer in the pack')).toBeTruthy()
    await openFirst("Crafting Guild, Heroes' Guild, Mining Guild")
    expect(screen.getByText('As filed; no longer in the pack')).toBeTruthy()
    expect(screen.getByText("Which one doesn't belong?")).toBeTruthy()
  })

  it('lists the questions of this build that ask about a reported item', async () => {
    vi.mocked(admin.getReports).mockResolvedValue({
      reports: [
        report({ mode: 'more_less', question_id: null, snapshot: { id: 373, name: 'Swordfish' } }),
      ],
      counts: { open: 1, closed: 0 },
    })
    render(ReportQueue, { token: 't', onrefused: vi.fn() })
    await openFirst('Swordfish')
    expect(screen.getByText('1 in this build ask about it:')).toBeTruthy()
    expect(screen.getByText('Swordfish (248)', { selector: 'strong' })).toBeTruthy()
  })

  it('closes a report, and reopens a closed one', async () => {
    render(ReportQueue, { token: 't', onrefused: vi.fn() })
    await openFirst(/Crafting Guild/)
    await fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(admin.setReportStatus).toHaveBeenCalledWith('t', 'one', 'closed')

    vi.mocked(admin.getReports).mockResolvedValue({
      reports: [report({ status: 'closed' })],
      counts: { open: 0, closed: 1 },
    })
    await fireEvent.click(screen.getByRole('tab', { name: /Closed/ }))
    await openFirst(/Crafting Guild/)
    await fireEvent.click(screen.getByRole('button', { name: 'Reopen' }))
    expect(admin.setReportStatus).toHaveBeenCalledWith('t', 'one', 'open')
  })
})
