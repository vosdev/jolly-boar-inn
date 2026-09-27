/**
 * The create form against `/api/modes`: `custom` is listed there, with no round length,
 * because the host's questions are random events rather than a round. The form must not
 * offer it as one — ticked by default, it would have every room refused. Since T22 it
 * sends how often the NPCs interrupt, and counts their questions in the total it shows.
 * It never asks for a name: the host is the profile, and a browser with none gets one
 * the way Join gives one.
 */

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte'
import { get } from 'svelte/store'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as api from '../lib/api'
import { nudge, profile } from '../lib/profile'
import { createdRooms, rememberCreated, setSession } from '../lib/session'
import Create from './Create.svelte'
import Home from './Home.svelte'

const PACING: api.ModePacing[] = [
  {
    id: 'more_less',
    types: ['more_less'],
    questions: { default: 5, min: 1, max: 30 },
    seconds: { default: 10, min: 5, max: 20 },
  },
  {
    id: 'price_is_right',
    types: ['price_is_right'],
    questions: { default: 5, min: 1, max: 30 },
    seconds: { default: 10, min: 5, max: 30 },
  },
  { id: 'custom', types: [], questions: null, seconds: null },
]

vi.mock('../lib/api', async (importOriginal) => {
  const real = await importOriginal<typeof import('../lib/api')>()
  return { ...real, getModes: vi.fn(), createRoom: vi.fn(), getRoom: vi.fn(), deleteRoom: vi.fn() }
})

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  vi.mocked(api.getRoom).mockResolvedValue({ status: 'lobby', players: 1 })
  vi.mocked(api.deleteRoom).mockResolvedValue(undefined)
  vi.mocked(api.getModes).mockResolvedValue(structuredClone(PACING))
  vi.mocked(api.createRoom).mockResolvedValue({
    code: 'ABYSSAL',
    session: 's',
    expires_at: '2099-01-01T00:00:00Z',
    player: { id: 'p', display_name: 'Zezima', role: 'admin', connected: false },
  })
  profile.set({ name: 'Zezima', head: 3 })
  nudge.set(null)
})

async function submitted(): Promise<api.NewRoomSettings> {
  await fireEvent.click(screen.getByRole('button', { name: 'Create room' }))
  await waitFor(() => expect(api.createRoom).toHaveBeenCalledOnce())
  return vi.mocked(api.createRoom).mock.calls[0]![1]
}

/** The form, once `/api/modes` has answered and the rounds are drawn. */
async function loaded(): Promise<void> {
  render(Create, { navigate: () => {} })
  await screen.findByRole('checkbox', { name: /^More or Less/ })
}

describe('Create', () => {
  it('has no name field', async () => {
    await loaded()
    expect(screen.queryAllByRole('textbox')).toHaveLength(0)
    expect(screen.queryByRole('button', { name: 'Roll a random name' })).toBeNull()
  })

  it('creates under the profile, and one tap lands the host in the lobby un-nudged', async () => {
    const navigate = vi.fn()
    render(Create, { navigate })
    await screen.findByRole('checkbox', { name: /^More or Less/ })
    await submitted()
    expect(vi.mocked(api.createRoom).mock.calls[0]).toEqual(['Zezima', expect.anything(), 3])
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/r/ABYSSAL'))
    expect(get(profile)).toEqual({ name: 'Zezima', head: 3 })
    expect(get(nudge)).toBeNull()
  })

  it('gives a browser with no profile one in one tap, creates as it, and nudges once', async () => {
    profile.set(null)
    const navigate = vi.fn()
    render(Create, { navigate })
    expect(document.querySelector('dialog')).toBeNull()
    await screen.findByRole('checkbox', { name: /^More or Less/ })
    await submitted()
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/r/ABYSSAL'))
    const [name, , head] = vi.mocked(api.createRoom).mock.calls[0]!
    expect(get(profile)).toEqual({ name, head })
    expect(get(nudge)).toBe('ABYSSAL')
  })

  it('keeps no generated profile from a create that failed, so the next one still nudges', async () => {
    profile.set(null)
    vi.mocked(api.createRoom).mockRejectedValueOnce(new api.ApiFailure(503, 'db_unavailable', 'down'))
    await loaded()
    await submitted()
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(get(profile)).toBeNull()
    expect(get(nudge)).toBeNull()
  })

  it('offers every mode but custom as a round', async () => {
    await loaded()
    expect(screen.getByRole('checkbox', { name: /^The Price is Right/ })).toBeTruthy()
    expect(screen.queryByRole('checkbox', { name: /Host's Questions|custom/ })).toBeNull()
    expect(screen.getByText('Rounds (2)')).toBeTruthy()
  })

  it("names each mode's host above its checkbox, outside the checkbox's name", async () => {
    await loaded()
    const presents = screen.getByText('Ali Morrisane presents:')
    const box = screen.getByRole('checkbox', { name: /^More or Less/ })
    expect(presents.nextElementSibling?.contains(box)).toBe(true)
    expect(screen.getByText('Grand Exchange Clerk presents:')).toBeTruthy()
  })

  it('lists the modes still coming, ticked off and disabled', async () => {
    await loaded()
    for (const name of [/^Who is That NPC\?/, /^Name that spell/, /^Minimap Guesser/]) {
      const box = screen.getByRole('checkbox', { name }) as HTMLInputElement
      expect([box.checked, box.disabled]).toEqual([false, true])
    }
  })

  it('stops calling a mode upcoming once the server plays it', async () => {
    const shipped = { ...PACING[0]!, types: ['pick_from_list'] }
    vi.mocked(api.getModes).mockResolvedValue([
      ...structuredClone(PACING),
      { ...shipped, id: 'whos_that_npc' },
      { ...shipped, id: 'minimap_guesser' },
    ])
    await loaded()
    expect(screen.queryByRole('checkbox', { name: /^Who is That NPC\?/ })).toBeNull()
    expect(screen.queryByRole('checkbox', { name: /^Minimap Guesser/ })).toBeNull()
    for (const id of ['whos_that_npc', 'minimap_guesser']) {
      expect((screen.getByRole('checkbox', { name: id }) as HTMLInputElement).disabled).toBe(false)
    }
    expect(screen.getByRole('checkbox', { name: /^Name that spell/ })).toBeTruthy()
  })

  it('sends the rounds picked and how often events come, and no order', async () => {
    await loaded()
    const settings = await submitted()
    expect(settings.modes.map((round) => round.mode)).toEqual(['more_less', 'price_is_right'])
    expect(settings.random_event_frequency).toBe('default')
    expect(settings).not.toHaveProperty('random_events')
    expect(settings).not.toHaveProperty('order')
  })

  it('lets the host pick how often, and offers no way to turn events off', async () => {
    await loaded()
    const choice = screen.getByLabelText('Random events') as HTMLSelectElement
    expect([...choice.options].map((option) => option.textContent)).toEqual([
      'Less often: one every 20 questions',
      'Default: one every 10 questions',
      'More often: one every 5 questions',
    ])
    await fireEvent.change(choice, { target: { value: 'more' } })
    expect((await submitted()).random_event_frequency).toBe('more')
  })

  /** The summary under the rounds, whole, however its parts are marked up. */
  function summary(): string {
    return document.querySelector('.rounds + .note')?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
  }

  it('says how many questions the room plays, events included, before it exists', async () => {
    // T22 Accept: one mode of ten at the default plays eleven, and Create says so.
    await loaded()
    await fireEvent.click(screen.getByRole('checkbox', { name: /^The Price is Right/ }))
    await fireEvent.input(screen.getByLabelText('Questions', { selector: '#questions-more_less' }), {
      target: { value: '10' },
    })
    expect(summary()).toBe('11 questions: 10 in the rounds and 1 random event')
    const choice = screen.getByLabelText('Random events')
    await fireEvent.change(choice, { target: { value: 'less' } })
    expect(summary()).toBe('10 questions')
    await fireEvent.change(choice, { target: { value: 'more' } })
    expect(summary()).toBe('12 questions: 10 in the rounds and 2 random events')
  })

  it('counts the events against the cap, as the server does', async () => {
    await loaded()
    await fireEvent.input(screen.getByLabelText('Questions', { selector: '#questions-more_less' }), {
      target: { value: '30' },
    })
    expect(summary()).toBe('38 questions: 35 in the rounds and 3 random events')
  })

  it('sends how long the standings hold between rounds, 10 unless changed (D9)', async () => {
    await loaded()
    expect((await submitted()).standings_seconds).toBe(10)
  })

  it('takes 0 for no standings, and will not submit past 30', async () => {
    await loaded()
    const field = screen.getByLabelText('Standings between rounds, seconds')
    await fireEvent.input(field, { target: { value: '31' } })
    const create = screen.getByRole('button', { name: 'Create room' }) as HTMLButtonElement
    expect(create.disabled).toBe(true)
    await fireEvent.input(field, { target: { value: '0' } })
    expect(create.disabled).toBe(false)
    expect((await submitted()).standings_seconds).toBe(0)
  })

  it('will not submit a reveal outside 2 to 30, or none at all', async () => {
    await loaded()
    const field = screen.getByLabelText('Reveal answers seconds')
    const create = screen.getByRole('button', { name: 'Create room' }) as HTMLButtonElement
    for (const value of ['45', '1', '']) {
      await fireEvent.input(field, { target: { value } })
      expect(create.disabled).toBe(true)
    }
    await fireEvent.input(field, { target: { value: '30' } })
    expect(create.disabled).toBe(false)
    expect((await submitted()).reveal_seconds).toBe(30)
  })

  it('remembers the room it created until the server says it expires', async () => {
    await loaded()
    await submitted()
    await waitFor(() => expect(createdRooms(Date.parse('2098-12-31T23:59:59Z'))).toEqual(['ABYSSAL']))
    expect(createdRooms(Date.parse('2099-01-01T00:00:00Z'))).toEqual([])
  })
})

describe('Create with five rooms already', () => {
  const HOSTED = ['RUNE', 'DRAGON', 'BARROWS', 'ZULRAH', 'VORKATH']

  beforeEach(() => {
    for (const code of HOSTED) {
      rememberCreated(code, '2099-01-01T00:00:00Z')
      setSession(code, `s-${code}`)
    }
  })

  it('refuses a sixth and links the homepage, where each room has Remove', async () => {
    const navigate = vi.fn()
    render(Create, { navigate })
    const banner = await screen.findByText(/You already have five rooms/)
    expect(banner.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'You already have five rooms. Remove one on the homepage to make another.',
    )
    expect(screen.queryByRole('button', { name: 'Create room' })).toBeNull()
    await fireEvent.click(within(banner).getByRole('link', { name: 'homepage' }))
    expect(navigate).toHaveBeenCalledWith('/')
    expect(api.createRoom).not.toHaveBeenCalled()
  })

  it('lets the sixth through once one is removed on the homepage', async () => {
    render(Home, { navigate: vi.fn() })
    const rune = screen.getByText('RUNE').closest('li')!
    await fireEvent.click(within(rune).getByRole('button', { name: 'Remove' }))
    await fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(createdRooms()).not.toContain('RUNE'))
    cleanup()
    await loaded()
    await submitted()
  })

  it.each([404, 410])('drops a room that answers %i from the list rather than counting it', async (status) => {
    vi.mocked(api.getRoom).mockImplementation(async (code) => {
      if (code === 'ZULRAH') throw new api.ApiFailure(status, 'gone', 'gone')
      return { status: 'lobby', players: 1 }
    })
    await loaded()
    await submitted()
    expect(createdRooms()).not.toContain('ZULRAH')
  })

  it('counts a room it could not check, since nothing says it is gone', async () => {
    vi.mocked(api.getRoom).mockRejectedValue(new api.ApiFailure(429, 'rate_limited', 'slow down'))
    render(Create, { navigate: () => {} })
    expect(await screen.findByText(/You already have five rooms/)).toBeTruthy()
    expect(createdRooms()).toHaveLength(5)
  })

  it('refuses at submit when another tab filled the list since the form loaded', async () => {
    const [last, ...four] = HOSTED
    localStorage.clear()
    for (const code of four) rememberCreated(code, '2099-01-01T00:00:00Z')
    await loaded()
    await waitFor(() =>
      expect((screen.getByRole('button', { name: 'Create room' }) as HTMLButtonElement).disabled).toBe(false),
    )
    rememberCreated(last!, '2099-01-01T00:00:00Z')
    await fireEvent.click(screen.getByRole('button', { name: 'Create room' }))
    expect(await screen.findByText(/You already have five rooms/)).toBeTruthy()
    expect(api.createRoom).not.toHaveBeenCalled()
  })
})

describe('Create under five rooms', () => {
  it('asks the server nothing about them', async () => {
    for (const code of ['RUNE', 'DRAGON', 'BARROWS', 'ZULRAH']) {
      rememberCreated(code, '2099-01-01T00:00:00Z')
    }
    await loaded()
    await submitted()
    expect(api.getRoom).not.toHaveBeenCalled()
  })
})
