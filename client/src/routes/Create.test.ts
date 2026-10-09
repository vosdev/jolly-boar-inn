/**
 * The create form against `/api/modes`: `custom` is listed there, with no round length,
 * because the host's questions are random events rather than a round. The form must not
 * offer it as one — ticked by default, it would have every room refused. It
 * sends how often the NPCs interrupt, and counts their questions in the total it shows.
 * It never asks for a name: the host is the profile, and a browser with none gets one
 * the way Join gives one.
 */

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte'
import { get } from 'svelte/store'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as api from '../lib/api'
import { profile } from '../lib/profile'
import { createdRooms, rememberCreated, setSession } from '../lib/session'
import { arrival } from '../lib/stats'
import Create from './Create.svelte'
import Home from './Home.svelte'

const PACING: api.ModePacing[] = [
  {
    id: 'more_less',
    types: ['more_less'],
    questions: { default: 5, min: 1, max: 30 },
  },
  {
    id: 'price_is_right',
    types: ['price_is_right'],
    questions: { default: 5, min: 1, max: 30 },
  },
  { id: 'custom', types: [], questions: null },
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
  profile.set({ name: 'Zezima', pet: 'aggy' })
})

async function submitted(): Promise<api.NewRoomSettings> {
  await fireEvent.click(screen.getByRole('button', { name: 'Create room' }))
  await waitFor(() => expect(api.createRoom).toHaveBeenCalledOnce())
  return vi.mocked(api.createRoom).mock.calls[0]![1]
}

/** Mode `name`'s card, found by the box that picks it. */
function card(name: string): HTMLElement {
  return screen.getByRole('checkbox', { name }).closest('li')!
}

async function press(scope: HTMLElement, name: string, times = 1): Promise<void> {
  for (let i = 0; i < times; i++) await fireEvent.click(within(scope).getByRole('button', { name }))
}

const BOTH = ['More or Less', 'The Price is Right']

/** Tick the modes named, in that order: the order is the running order. */
async function pick(...names: string[]): Promise<void> {
  for (const name of names) await fireEvent.click(screen.getByRole('checkbox', { name }))
}

/** The form, once `/api/modes` has answered, with `modes` ticked: none are, to begin with. */
async function loaded(...modes: string[]): Promise<void> {
  render(Create, { navigate: () => {} })
  await screen.findByRole('checkbox', { name: /^More or Less/ })
  await pick(...modes)
}

/** The line under the cards, whole, however its parts are marked up. */
function summary(): string {
  return document.querySelector('.count')?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
}

describe('Create', () => {
  it('puts its heading and what it is for on a panel', async () => {
    await loaded()
    const intro = screen.getByRole('heading', { level: 1, name: 'Create a room' }).closest('.panel')
    expect(intro?.querySelector('.tagline')?.textContent).toContain('cannot be changed')
  })

  it('has no name field', async () => {
    await loaded()
    expect(screen.queryAllByRole('textbox')).toHaveLength(0)
    expect(screen.queryByRole('button', { name: 'Roll a random name' })).toBeNull()
  })

  it('creates under the profile, and one tap lands the host in the lobby', async () => {
    const navigate = vi.fn()
    render(Create, { navigate })
    await screen.findByRole('checkbox', { name: /^More or Less/ })
    await pick(...BOTH)
    await submitted()
    expect(vi.mocked(api.createRoom).mock.calls[0]).toEqual([
      'Zezima',
      expect.anything(),
      'aggy',
      false,
      'code',
      [],
      { device: 'desktop' },
    ])
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/r/ABYSSAL'))
    expect(get(profile)).toEqual({ name: 'Zezima', pet: 'aggy' })
  })

  it('sends a picked theme with the device, and neither again once the room is made', async () => {
    localStorage.setItem('jbi:theme', 'wilderness')
    render(Create, { navigate: vi.fn() })
    await screen.findByRole('checkbox', { name: /^More or Less/ })
    await pick(...BOTH)
    await submitted()
    expect(vi.mocked(api.createRoom).mock.calls[0]![6]).toEqual({
      theme: 'wilderness',
      device: 'desktop',
    })
    await waitFor(() => expect(arrival()).toEqual({}))
  })

  it('asks a browser with no profile for a name on Create, and makes no room until it has one', async () => {
    profile.set(null)
    await loaded(...BOTH)
    expect(document.querySelector('dialog')).toBeNull()
    await fireEvent.click(screen.getByRole('button', { name: 'Create room' }))
    const field = (await screen.findByRole('textbox')) as HTMLInputElement
    expect(field.closest('dialog')?.open).toBe(true)
    expect(api.createRoom).not.toHaveBeenCalled()
    expect(get(profile)).toBeNull()
  })

  it('creates as the name and pet confirmed, and keeps them as the profile', async () => {
    profile.set(null)
    const navigate = vi.fn()
    render(Create, { navigate })
    await screen.findByRole('checkbox', { name: /^More or Less/ })
    await pick(...BOTH)
    await fireEvent.click(screen.getByRole('button', { name: 'Create room' }))
    const field = (await screen.findByRole('textbox')) as HTMLInputElement
    await fireEvent.input(field, { target: { value: 'Zezima' } })
    await fireEvent.click(within(field.closest('dialog')!).getByRole('button', { name: 'Create room' }))
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/r/ABYSSAL'))
    const [name, , pet, returning] = vi.mocked(api.createRoom).mock.calls[0]!
    expect(name).toBe('Zezima')
    expect(returning).toBe(false)
    expect(get(profile)).toEqual({ name: 'Zezima', pet })
  })

  it('keeps the name chosen through a create that failed, so the next one does not ask again', async () => {
    profile.set(null)
    vi.mocked(api.createRoom).mockRejectedValueOnce(new api.ApiFailure(503, 'db_unavailable', 'down'))
    await loaded(...BOTH)
    await fireEvent.click(screen.getByRole('button', { name: 'Create room' }))
    const field = await screen.findByRole('textbox')
    await fireEvent.click(within(field.closest('dialog')!).getByRole('button', { name: 'Create room' }))
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(get(profile)).not.toBeNull()
    expect(document.querySelector('dialog')).toBeNull()
  })

  it('offers every mode but custom as a round', async () => {
    await loaded()
    expect(screen.getByRole('checkbox', { name: /^The Price is Right/ })).toBeTruthy()
    expect(screen.queryByRole('checkbox', { name: /Host's Questions|custom/ })).toBeNull()
  })

  it('starts with no mode picked, and says so until the host picks one', async () => {
    await loaded()
    for (const name of BOTH) {
      expect((screen.getByRole('checkbox', { name }) as HTMLInputElement).checked).toBe(false)
    }
    expect(summary()).toBe('Pick at least one type; a room with no rounds is no game.')
    expect(screen.getByRole('button', { name: 'Create room' })).toHaveProperty('disabled', true)
    await pick('More or Less')
    expect(summary()).toMatch(/^1 round, /)
    expect(screen.getByRole('button', { name: 'Create room' })).toHaveProperty('disabled', false)
  })

  it("shows each mode's host by face, with no line naming them", async () => {
    await loaded()
    expect(card('More or Less').querySelector('.face img')).toBeTruthy()
    expect(screen.queryByText(/presents/)).toBeNull()
  })

  it("names each card's box after its mode alone, and puts the hint beside it", async () => {
    await loaded()
    const hint = screen.getByText('A mix of Grand Exchange, High Alchemy and NPC prices.')
    expect(card('More or Less').contains(hint)).toBe(true)
    expect(hint.classList.contains('note')).toBe(true)
  })

  it('lists the modes still coming, with their hints and nothing to pick', async () => {
    await loaded()
    for (const [name, hint] of [
      ['Who is That NPC?', "It's Elvarg!"],
      ['Name that spell', 'Because everyone plays with sound effects on!'],
      ['Minimap Guesser', 'Where in the name of Gielinor is that?'],
    ] as const) {
      const soon = screen.getByText(name).closest('li')!
      expect(soon.classList.contains('upcoming')).toBe(true)
      expect(within(soon).getByText('Coming soon')).toBeTruthy()
      expect(within(soon).getByText(hint)).toBeTruthy()
      expect(within(soon).queryByRole('checkbox')).toBeNull()
      expect(within(soon).queryByRole('button')).toBeNull()
    }
  })

  it('stands its host on a mode still coming, where a lock used to be', async () => {
    await loaded()
    const soon = screen.getByText('Name that spell').closest('li')!
    expect(soon.querySelector('.face img')).toBeTruthy()
    expect(soon.querySelector('.lock')).toBeNull()
  })

  it('picks a mode by a tap anywhere on its card but its controls', async () => {
    await loaded('The Price is Right')
    const box = (): HTMLInputElement =>
      screen.getByRole('checkbox', { name: 'More or Less' }) as HTMLInputElement
    const more = card('More or Less')
    expect(box().checked).toBe(false)
    await fireEvent.click(within(more).getByText('More or Less'))
    await press(more, 'More questions')
    await fireEvent.click(within(more).getByText('6'))
    expect(box().checked).toBe(true)
    await fireEvent.click(within(more).getByText('A mix of Grand Exchange, High Alchemy and NPC prices.'))
    expect(box().checked).toBe(false)
    await fireEvent.click(within(card('More or Less')).getByText('More or Less'))
    expect(box().checked).toBe(true)
    await fireEvent.click(box())
    expect(box().checked).toBe(false)
    expect((await submitted()).modes.map((round) => round.mode)).toEqual(['price_is_right'])
  })

  it('offers nothing to pick on a card still coming', async () => {
    await loaded(...BOTH)
    await fireEvent.click(screen.getByText('Who is That NPC?'))
    expect((await submitted()).modes.map((round) => round.mode)).toEqual(['more_less', 'price_is_right'])
  })

  it('keeps the order choice in place and says what is wrong where the count was', async () => {
    await loaded(...BOTH)
    await pick(...BOTH)
    expect(summary()).toBe('Pick at least one type; a room with no rounds is no game.')
    expect(document.querySelector('.count')?.classList.contains('error')).toBe(true)
    expect(screen.getByRole('radio', { name: 'Random' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Create room' })).toHaveProperty('disabled', true)
  })

  it("steps questions by one, stops at the server's bounds, and offers no seconds", async () => {
    await loaded('More or Less')
    const more = card('More or Less')
    expect(within(more).queryByRole('button', { name: 'More seconds' })).toBeNull()
    await press(more, 'Fewer questions', 9)
    expect(within(more).getByRole('button', { name: 'Fewer questions' })).toHaveProperty('disabled', true)
    await press(more, 'More questions', 2)
    const [round] = (await submitted()).modes
    expect(round).toEqual({ mode: 'more_less', questions: 3 })
  })

  it('shuffles the rounds unless told otherwise, and then shows no order to arrange', async () => {
    await loaded(...BOTH)
    for (const name of ['More or Less', 'The Price is Right']) {
      expect(card(name).querySelector('.badge')?.textContent?.trim()).toBe('')
      expect(within(card(name)).queryByRole('button', { name: /^Move / })).toBeNull()
      expect(within(card(name)).queryByText('Order')).toBeNull()
    }
    expect((screen.getByRole('radio', { name: 'Random' }) as HTMLInputElement).checked).toBe(true)
    expect((await submitted()).mode_order).toBe('random')
  })

  it('numbers the rounds as the host arranges them, and plays them that way', async () => {
    await loaded(...BOTH)
    await fireEvent.click(screen.getByRole('radio', { name: 'As numbered' }))
    const badge = (name: string): string | undefined =>
      card(name).querySelector('.badge')?.textContent?.trim()
    expect([badge('More or Less'), badge('The Price is Right')]).toEqual(['1', '2'])
    expect(screen.getByRole('button', { name: 'Move More or Less earlier' })).toHaveProperty('disabled', true)
    await fireEvent.click(screen.getByRole('button', { name: 'Move More or Less later' }))
    expect([badge('More or Less'), badge('The Price is Right')]).toEqual(['2', '1'])
    const settings = await submitted()
    expect(settings.mode_order).toBe('listed')
    expect(settings.modes.map((round) => round.mode)).toEqual(['price_is_right', 'more_less'])
  })

  it('offers no order to arrange for a single round', async () => {
    await loaded('More or Less')
    await fireEvent.click(screen.getByRole('radio', { name: 'As numbered' }))
    expect(within(card('More or Less')).queryByRole('button', { name: /^Move / })).toBeNull()
  })

  it('stops calling a mode upcoming once the server plays it', async () => {
    const shipped = { ...PACING[0]!, types: ['pick_from_list'] }
    vi.mocked(api.getModes).mockResolvedValue([
      ...structuredClone(PACING),
      { ...shipped, id: 'whos_that_npc' },
      { ...shipped, id: 'minimap_guesser' },
    ])
    await loaded()
    expect(screen.queryByText('Who is That NPC?')).toBeNull()
    expect(screen.queryByText('Minimap Guesser')).toBeNull()
    for (const id of ['whos_that_npc', 'minimap_guesser']) {
      expect((screen.getByRole('checkbox', { name: id }) as HTMLInputElement).checked).toBe(false)
    }
    expect(screen.getByText('Name that spell').closest('li')?.classList.contains('upcoming')).toBe(true)
  })

  it('sends the rounds picked and how often events come, and no order', async () => {
    await loaded(...BOTH)
    const settings = await submitted()
    expect(settings.modes.map((round) => round.mode)).toEqual(['more_less', 'price_is_right'])
    expect(settings.random_event_frequency).toBe('default')
    expect(settings).not.toHaveProperty('random_events')
    expect(settings).not.toHaveProperty('order')
    expect(settings).not.toHaveProperty('splash_seconds')
  })

  it('offers no way to turn the round introductions off', async () => {
    await loaded(...BOTH)
    expect(screen.queryByRole('group', { name: 'Introduce each round' })).toBeNull()
  })

  it('lets the host pick how often, says how often that is, and offers no way off', async () => {
    await loaded(...BOTH)
    const choice = screen.getByRole('group', { name: 'Random events frequency' })
    expect(within(choice).getAllByRole('radio').map((radio) => radio.closest('label')?.textContent?.trim())).toEqual(
      ['Less', 'Default', 'More'],
    )
    const note = (): string | undefined => choice.nextElementSibling?.textContent?.replace(/\s+/g, ' ').trim()
    expect(note()).toBe("An NPC interrupts on average once every 10 questions, on top of the round's.")
    await fireEvent.click(within(choice).getByRole('radio', { name: 'More' }))
    expect(note()).toBe("An NPC interrupts on average once every 5 questions, on top of the round's.")
    expect((await submitted()).random_event_frequency).toBe('more')
  })

  it('gives random events their own panel, and keeps the rest under a closed Advanced', async () => {
    await loaded(...BOTH)
    const events = screen.getByRole('heading', { name: 'Random events frequency' }).closest('section')
    expect(events?.contains(screen.getByRole('group', { name: 'Random events frequency' }))).toBe(true)
    expect(events?.textContent).toMatch(/\d+ random events? in this game/)
    const advanced = screen.getByRole('heading', { name: 'Advanced' }).closest('details')
    expect(advanced?.open).toBe(false)
    for (const name of ['Name who got it wrong', 'Surprise rounds']) {
      expect(advanced?.contains(screen.getByRole('group', { name }))).toBe(true)
    }
    expect(advanced?.contains(screen.getByRole('group', { name: 'Access' }))).toBe(false)
  })

  it('names who got it wrong unless the host turns it off', async () => {
    await loaded(...BOTH)
    expect((await submitted()).name_wrong_answers).toBe(true)
  })

  it('sends the two switches as set', async () => {
    await loaded(...BOTH)
    const flip = async (group: string, to: 'Off' | 'On'): Promise<void> => {
      const switches = screen.getByRole('group', { name: group })
      await fireEvent.click(within(switches).getByRole('radio', { name: to }))
    }
    await flip('Close when everyone has answered', 'Off')
    await flip('Name who got it wrong', 'Off')
    const settings = await submitted()
    expect(settings.close_when_all_answered).toBe(false)
    expect(settings.name_wrong_answers).toBe(false)
  })

  it('keeps the rounds out of the lobby only when the host asks for surprise rounds', async () => {
    await loaded(...BOTH)
    const choice = screen.getByRole('group', { name: 'Surprise rounds' })
    expect((within(choice).getByRole('radio', { name: 'Off' }) as HTMLInputElement).checked).toBe(true)
    expect(choice.nextElementSibling?.textContent).toBe('Hide the game modes in the lobby from the players')
    await fireEvent.click(within(choice).getByRole('radio', { name: 'On' }))
    expect((await submitted()).hide_rounds).toBe(true)
  })

  it('lets anyone with the code in unless the host picks the link or the public list', async () => {
    await loaded(...BOTH)
    const choice = screen.getByRole('group', { name: 'Access' })
    const radio = (name: string): HTMLInputElement =>
      within(choice).getByRole('radio', { name }) as HTMLInputElement
    expect(radio('Room code').checked).toBe(true)
    expect(choice.nextElementSibling?.textContent).toBe('Anyone you give the room code to can join.')
    await fireEvent.click(radio('Invite link'))
    expect(choice.nextElementSibling?.textContent).toBe(
      "The room code alone won't let anyone in; they need the link, or be manually approved by you.",
    )
    await fireEvent.click(radio('Public'))
    expect(radio('Invite link').checked).toBe(false)
    expect(choice.nextElementSibling?.textContent).toBe(
      "Listed on this site's homepage, where anyone can join it.",
    )
    await submitted()
    expect(vi.mocked(api.createRoom).mock.calls[0]![4]).toBe('public')
  })

  it('says how many questions the room plays, events included, before it exists', async () => {
    // One mode of ten at the default plays eleven, and Create says so.
    await loaded('More or Less')
    await press(card('More or Less'), 'More questions', 5)
    expect(summary()).toBe('1 round, 11 questions (10 in the rounds, 1 random event)')
    await fireEvent.click(screen.getByRole('radio', { name: 'Less' }))
    expect(summary()).toBe('1 round, 10 questions')
    await fireEvent.click(screen.getByRole('radio', { name: 'More' }))
    expect(summary()).toBe('1 round, 12 questions (10 in the rounds, 2 random events)')
  })

  it('counts the events against the cap, as the server does', async () => {
    await loaded(...BOTH)
    await press(card('More or Less'), 'More questions', 25)
    expect(summary()).toBe('2 rounds, 38 questions (35 in the rounds, 3 random events)')
  })

  it('sends how long the standings hold between rounds, 10 unless changed', async () => {
    await loaded(...BOTH)
    expect((await submitted()).standings_seconds).toBe(10)
  })

  it('steps the standings by five, from 0 for none to 30', async () => {
    const page = document.body
    await loaded(...BOTH)
    await press(page, 'More standings seconds', 4)
    expect(screen.getByRole('button', { name: 'More standings seconds' })).toHaveProperty('disabled', true)
    await press(page, 'Fewer standings seconds', 6)
    expect(screen.getByRole('button', { name: 'Fewer standings seconds' })).toHaveProperty('disabled', true)
    expect((await submitted()).standings_seconds).toBe(0)
  })

  it('sends the run pace unless changed, and no reveal of its own', async () => {
    await loaded(...BOTH)
    expect(screen.getByRole('radio', { name: 'Run' })).toHaveProperty('checked', true)
    expect(screen.queryByRole('button', { name: 'More reveal seconds' })).toBeNull()
    const settings = await submitted()
    expect(settings.pace).toBe('run')
    expect(settings).not.toHaveProperty('reveal_seconds')
  })

  it('offers walk, run and teleport, and sends the one picked', async () => {
    await loaded(...BOTH)
    for (const name of ['Walk', 'Run', 'Teleport']) expect(screen.getByRole('radio', { name })).toBeTruthy()
    await fireEvent.click(screen.getByRole('radio', { name: 'Teleport' }))
    expect(screen.getByText('For a room that knows its stuff.')).toBeTruthy()
    expect((await submitted()).pace).toBe('teleport')
  })

  it('remembers the room it created until the server says it expires', async () => {
    await loaded(...BOTH)
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
    // The top of the page, above the form, not under the buttons where it goes unseen.
    const form = document.querySelector('form')!
    expect(banner.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    await fireEvent.click(within(banner).getByRole('link', { name: 'homepage' }))
    expect(navigate).toHaveBeenCalledWith('/')
    expect(api.createRoom).not.toHaveBeenCalled()
  })

  it('lets the sixth through once one is removed on the homepage', async () => {
    render(Home, { navigate: vi.fn() })
    const rune = screen.getByText('RUNE').closest('li')!
    await fireEvent.click(within(rune).getByRole('button', { name: 'Remove room RUNE' }))
    await fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(createdRooms()).not.toContain('RUNE'))
    cleanup()
    await loaded(...BOTH)
    await submitted()
  })

  it.each([404, 410])('drops a room that answers %i from the list rather than counting it', async (status) => {
    vi.mocked(api.getRoom).mockImplementation(async (code) => {
      if (code === 'ZULRAH') throw new api.ApiFailure(status, 'gone', 'gone')
      return { status: 'lobby', players: 1 }
    })
    await loaded(...BOTH)
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
    await loaded(...BOTH)
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
    await loaded(...BOTH)
    await submitted()
    expect(api.getRoom).not.toHaveBeenCalled()
  })
})
