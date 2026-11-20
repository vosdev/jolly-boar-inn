/**
 * The create form against `/api/modes`: `custom` is listed there, with no round length,
 * because the host's questions are random events rather than a round. The form must not
 * offer it as one — ticked by default, it would have every room refused. It
 * sends how often the NPCs interrupt, and counts their questions in the total it shows.
 * It never asks for a name: the host is the profile, and a browser with none gets one
 * the way Join gives one.
 */

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte'
import { tick } from 'svelte'
import { get } from 'svelte/store'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as api from '../lib/api'
import { clearModesCache } from '../lib/howToPlay'
import { PLACEHOLDER_PET } from '../lib/pets'
import { profile } from '../lib/profile'
import type { ModeSettings } from '../lib/protocol'
import { createdRooms, rememberCreated, setSession } from '../lib/session'
import { arrival } from '../lib/stats'
import Create from './Create.svelte'
import Home from './Home.svelte'

const PACING: api.ModePacing[] = [
  {
    id: 'more_less',
    types: ['more_less'],
    questions: { default: 5, min: 1, max: 30 },
    seconds: { walk: 19, run: 15, teleport: 11 },
    as_of: null,
  },
  {
    id: 'price_is_right',
    types: ['price_is_right'],
    questions: { default: 5, min: 1, max: 30 },
    seconds: { walk: 15, run: 12, teleport: 9 },
    as_of: null,
  },
  { id: 'custom', types: [], questions: null, seconds: null, as_of: null },
]

vi.mock('../lib/api', async (importOriginal) => {
  const real = await importOriginal<typeof import('../lib/api')>()
  return {
    ...real,
    getModes: vi.fn(),
    getFreeCode: vi.fn(),
    createRoom: vi.fn(),
    getRoom: vi.fn(),
    deleteRoom: vi.fn(),
  }
})

beforeEach(() => {
  vi.clearAllMocks()
  clearModesCache()
  localStorage.clear()
  vi.mocked(api.getRoom).mockResolvedValue({ status: 'lobby', players: 1 })
  vi.mocked(api.deleteRoom).mockResolvedValue(undefined)
  vi.mocked(api.getModes).mockResolvedValue(structuredClone(PACING))
  vi.mocked(api.getFreeCode).mockResolvedValue('AbyssalWhip')
  vi.mocked(api.createRoom).mockResolvedValue({
    code: 'ABYSSAL',
    session: 's',
    expires_at: '2099-01-01T00:00:00Z',
    player: {
      id: 'p',
      display_name: 'Zezima',
      role: 'admin',
      connected: false,
      avatar: null,
      ready: false,
      editing: false,
      team: null,
      item: null,
    },
  })
  profile.set({ name: 'Zezima', pet: 'aggy' })
})

/** The button that makes the room. */
function createButton(): HTMLButtonElement {
  return screen.getByRole('button', { name: 'Open the doors' }) as HTMLButtonElement
}

/** The settings sent; `modes` is typed as present, since only a surprise room leaves it out. */
async function submitted(): Promise<api.NewRoomSettings & { modes: ModeSettings[] }> {
  await fireEvent.click(createButton())
  await waitFor(() => expect(api.createRoom).toHaveBeenCalledOnce())
  return vi.mocked(api.createRoom).mock.calls[0]![1] as api.NewRoomSettings & {
    modes: ModeSettings[]
  }
}

/** Mode `name`'s card, found by the box that picks it. */
function card(name: string): HTMLElement {
  return screen.getByRole('checkbox', { name }).closest('li')!
}

/** Mode `name`'s row among the rounds picked, where its questions are set. */
function round(name: string): HTMLElement {
  return screen.getByRole('group', { name }).closest('li')!
}

async function press(scope: HTMLElement, name: string, times = 1): Promise<void> {
  for (let i = 0; i < times; i++) await fireEvent.click(within(scope).getByRole('button', { name }))
}

/** Click the Tonight's game tab named. */
async function tab(name: string): Promise<void> {
  await fireEvent.click(screen.getByRole('tab', { name: new RegExp(`· ${name}`) }))
}

const BOTH = ['More or Less', 'The Price is Right']

function radioIn(group: string, name: string): HTMLInputElement {
  return within(screen.getByRole('group', { name: group })).getByRole('radio', {
    name,
  }) as HTMLInputElement
}

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

/** The panel's line about the game, whole, however its parts are marked up. */
function status(): string {
  return document.querySelector('.sum')?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
}

function shownNames(selector: string): string[] {
  return [...document.querySelectorAll(selector)].map((node) => node.textContent?.trim() ?? '')
}

/** Turn the team game on. */
async function teamGame(): Promise<void> {
  const choice = screen.getByRole('group', { name: 'How to play' })
  await fireEvent.click(within(choice).getByRole('radio', { name: 'Teams' }))
}

/** The gods ticked, by name. */
function ticked(): string[] {
  return within(screen.getByRole('group', { name: 'Gods' }))
    .getAllByRole('checkbox')
    .filter((box) => (box as HTMLInputElement).checked)
    .map((box) => box.closest('label')?.textContent?.trim() ?? '')
}

describe('Create', () => {
  it('is a lobby with its doors shut, and nothing reaches the server until they open', async () => {
    await loaded(...BOTH)
    expect(document.querySelector('.scroll')?.textContent).toContain('Room code')
    expect(
      screen.getByRole('region', { name: 'Your room' }).textContent?.replace(/\s+/g, ' '),
    ).toContain('72 hours')
    expect(api.createRoom).not.toHaveBeenCalled()
  })

  it('seats a host with no profile yet as a cat, not the boar', async () => {
    profile.set(null)
    await loaded()
    const seated = [...document.querySelectorAll<HTMLElement>('.pet')].map((pet) => pet.dataset.pet)
    expect(seated).toContain(PLACEHOLDER_PET)
    expect(seated).not.toContain('')
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
      'AbyssalWhip',
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
    await fireEvent.click(createButton())
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
    await fireEvent.click(createButton())
    const field = (await screen.findByRole('textbox')) as HTMLInputElement
    await fireEvent.input(field, { target: { value: 'Zezima' } })
    await fireEvent.click(
      within(field.closest('dialog')!).getByRole('button', { name: 'Open the doors' }),
    )
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/r/ABYSSAL'))
    const [name, , pet, returning] = vi.mocked(api.createRoom).mock.calls[0]!
    expect(name).toBe('Zezima')
    expect(returning).toBe(false)
    expect(get(profile)).toEqual({ name: 'Zezima', pet })
  })

  it('keeps the name chosen through a create that failed, so the next one does not ask again', async () => {
    profile.set(null)
    vi.mocked(api.createRoom).mockRejectedValueOnce(
      new api.ApiFailure(503, 'db_unavailable', 'down'),
    )
    await loaded(...BOTH)
    await fireEvent.click(createButton())
    const field = await screen.findByRole('textbox')
    await fireEvent.click(
      within(field.closest('dialog')!).getByRole('button', { name: 'Open the doors' }),
    )
    expect(await screen.findByText(/./, { selector: '.banner.bad' })).toBeTruthy()
    expect(get(profile)).not.toBeNull()
    expect(document.querySelector('dialog')).toBeNull()
  })

  it('shows the code it was handed on the sheet and creates the room under it', async () => {
    await loaded(...BOTH)
    const code = await screen.findByText('AbyssalWhip')
    expect(code.closest('.paper')).toBeTruthy()
    await submitted()
    expect(vi.mocked(api.createRoom).mock.calls[0]![7]).toBe('AbyssalWhip')
  })

  it('rerolls the code on request', async () => {
    await loaded(...BOTH)
    await screen.findByText('AbyssalWhip')
    vi.mocked(api.getFreeCode).mockResolvedValueOnce('Cabbage07')
    await fireEvent.click(screen.getByRole('button', { name: 'Reroll' }))
    expect(await screen.findByText('Cabbage07')).toBeTruthy()
    await submitted()
    expect(vi.mocked(api.createRoom).mock.calls[0]![7]).toBe('Cabbage07')
  })

  it('holds the reroll while the server refuses more, and frees it after', async () => {
    await loaded(...BOTH)
    await screen.findByText('AbyssalWhip')
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      vi.mocked(api.getFreeCode).mockRejectedValueOnce(
        new api.ApiFailure(429, 'rate_limited', 'slow', 3000),
      )
      const reroll = screen.getByRole('button', { name: 'Reroll' }) as HTMLButtonElement
      await fireEvent.click(reroll)
      await vi.waitUntil(() => reroll.disabled)
      vi.advanceTimersByTime(3000)
      await tick()
      expect(reroll.disabled).toBe(false)
      expect(screen.getByText('AbyssalWhip')).toBeTruthy()
    } finally {
      vi.useRealTimers()
    }
  })

  it('says so when the code was taken, and stays to let the host reroll', async () => {
    const navigate = vi.fn()
    vi.mocked(api.createRoom).mockRejectedValueOnce(
      new api.ApiFailure(409, 'code_taken', 'that room code is taken'),
    )
    render(Create, { navigate })
    await screen.findByRole('checkbox', { name: /^More or Less/ })
    await pick(...BOTH)
    await submitted()
    expect((await screen.findByText(/just taken/)).textContent).toBe(
      'That code was just taken - roll a new one.',
    )
    expect(navigate).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Reroll' })).toBeTruthy()
  })

  it('leaves the code to the server when none could be fetched', async () => {
    vi.mocked(api.getFreeCode).mockRejectedValue(new api.ApiFailure(429, 'rate_limited', 'slow'))
    await loaded(...BOTH)
    await submitted()
    expect(vi.mocked(api.createRoom).mock.calls[0]![7]).toBeUndefined()
  })

  it('offers every mode but custom as a round', async () => {
    await loaded()
    expect(screen.getByRole('checkbox', { name: /^The Price is Right/ })).toBeTruthy()
    expect(screen.queryByRole('checkbox', { name: /Host's Questions|custom/ })).toBeNull()
  })

  it('starts with no mode picked, and can open its doors like that', async () => {
    await loaded()
    for (const name of BOTH) {
      expect((screen.getByRole('checkbox', { name }) as HTMLInputElement).checked).toBe(false)
    }
    expect(status()).toBe('None yet')
    expect(document.body.textContent).toContain('Pick at least one round to start.')
    await pick('More or Less')
    expect(status()).toBe('1 round · 5 questions · ~2 min')
    await pick('More or Less')
    expect((await submitted()).modes).toEqual([])
  })

  it("shows each mode's host by face, with no line naming them", async () => {
    await loaded()
    expect(card('More or Less').querySelector('.face img')).toBeTruthy()
    expect(screen.queryByText(/presents/)).toBeNull()
  })

  it("names each card's box after its mode alone, and puts the hint on the card", async () => {
    await loaded()
    const hint = screen.getByText('A mix of Grand Exchange, High Alchemy and NPC prices.')
    expect(card('More or Less').contains(hint)).toBe(true)
    expect(hint.classList.contains('note')).toBe(true)
  })

  it('keeps a picked card as it was: its round is set among the rounds, not on the card', async () => {
    await loaded('More or Less')
    const more = card('More or Less')
    expect(within(more).queryByRole('button')).toBeNull()
    expect(within(more).queryByRole('group')).toBeNull()
    expect(
      within(round('More or Less')).getByRole('button', { name: 'More questions' }),
    ).toBeTruthy()
  })

  it('names the modes still coming by face and name, with nothing to pick', async () => {
    await loaded()
    for (const name of ['Scrying Pool', "What's That Noise?", 'Minimap Guesser']) {
      const soon = screen.getByText(name).closest('li')!
      expect(soon.classList.contains('upcoming')).toBe(true)
      expect(soon.querySelector('img')).toBeTruthy()
      expect(within(soon).queryByRole('checkbox')).toBeNull()
      expect(within(soon).queryByRole('button')).toBeNull()
    }
    expect(screen.getByRole('heading', { name: 'Coming soon' })).toBeTruthy()
  })

  it('picks a mode by a tap anywhere on its card', async () => {
    await loaded('The Price is Right')
    const box = (): HTMLInputElement =>
      screen.getByRole('checkbox', { name: 'More or Less' }) as HTMLInputElement
    expect(box().checked).toBe(false)
    await fireEvent.click(within(card('More or Less')).getByText('More or Less'))
    expect(box().checked).toBe(true)
    await fireEvent.click(
      within(card('More or Less')).getByText(
        'A mix of Grand Exchange, High Alchemy and NPC prices.',
      ),
    )
    expect(box().checked).toBe(false)
    await fireEvent.click(within(card('More or Less')).getByText('More or Less'))
    await fireEvent.click(box())
    expect(box().checked).toBe(false)
    expect((await submitted()).modes.map((round) => round.mode)).toEqual(['price_is_right'])
  })

  it('offers nothing to pick on a mode still coming', async () => {
    await loaded(...BOTH)
    await fireEvent.click(screen.getByText('Scrying Pool'))
    expect((await submitted()).modes.map((round) => round.mode)).toEqual([
      'more_less',
      'price_is_right',
    ])
  })

  it('keeps the order choice in place with nothing picked', async () => {
    await loaded(...BOTH)
    await pick(...BOTH)
    expect(status()).toBe('None yet')
    expect(screen.getByRole('radio', { name: 'Shuffled' })).toBeTruthy()
  })

  it("steps questions by one, stops at the server's bounds, and offers no seconds", async () => {
    await loaded('More or Less')
    const more = round('More or Less')
    expect(within(more).queryByRole('button', { name: 'More seconds' })).toBeNull()
    await press(more, 'Fewer questions', 9)
    expect(within(more).getByRole('button', { name: 'Fewer questions' })).toHaveProperty(
      'disabled',
      true,
    )
    await press(more, 'More questions', 2)
    const [sent] = (await submitted()).modes
    expect(sent).toEqual({ mode: 'more_less', questions: 3 })
  })

  it('shuffles the rounds unless told otherwise, and then shows no order to arrange', async () => {
    await loaded(...BOTH)
    for (const name of BOTH) {
      expect(round(name).querySelector('.number')).toBeNull()
      expect(within(round(name)).queryByRole('button', { name: /^Move / })).toBeNull()
    }
    expect((screen.getByRole('radio', { name: 'Shuffled' }) as HTMLInputElement).checked).toBe(true)
    expect((await submitted()).mode_order).toBe('random')
  })

  it('numbers the rounds in order, moves one with the arrow keys on its grip, and plays them that way', async () => {
    await loaded(...BOTH)
    await fireEvent.click(screen.getByRole('radio', { name: 'In order' }))
    expect(shownNames('.round .number')).toEqual(['1', '2'])
    const grip = screen.getByRole('button', { name: 'Move More or Less, round 1 of 2' })
    await fireEvent.keyDown(grip, { key: 'ArrowUp' })
    expect(screen.getByRole('button', { name: 'Move More or Less, round 1 of 2' })).toBeTruthy()
    await fireEvent.keyDown(grip, { key: 'ArrowDown' })
    expect(screen.getByRole('button', { name: 'Move More or Less, round 2 of 2' })).toBeTruthy()
    await waitFor(() =>
      expect(document.activeElement?.getAttribute('aria-label')).toBe(
        'Move More or Less, round 2 of 2',
      ),
    )
    const settings = await submitted()
    expect(settings.mode_order).toBe('listed')
    expect(settings.modes.map((round) => round.mode)).toEqual(['price_is_right', 'more_less'])
  })

  it('moves a round by dragging its grip past its neighbour', async () => {
    await loaded(...BOTH)
    await fireEvent.click(screen.getByRole('radio', { name: 'In order' }))
    const grip = screen.getByRole('button', { name: 'Move The Price is Right, round 2 of 2' })
    await fireEvent.pointerDown(grip, { button: 0, clientY: 100 })
    await fireEvent.pointerMove(grip, { clientY: 40 })
    await fireEvent.pointerUp(grip, { clientY: 40 })
    expect(
      screen.getByRole('button', { name: 'Move The Price is Right, round 1 of 2' }),
    ).toBeTruthy()
    expect((await submitted()).modes.map((round) => round.mode)).toEqual([
      'price_is_right',
      'more_less',
    ])
  })

  it('gives an ordered round its grip and number in place of the face, so the row still fits', async () => {
    await loaded(...BOTH)
    expect(document.querySelectorAll('.round .face')).toHaveLength(2)
    await fireEvent.click(screen.getByRole('radio', { name: 'In order' }))
    expect(document.querySelectorAll('.round .face')).toHaveLength(0)
    expect(document.querySelectorAll('.round .grip')).toHaveLength(2)
  })

  it('offers no order to arrange for a single round', async () => {
    await loaded('More or Less')
    await fireEvent.click(screen.getByRole('radio', { name: 'In order' }))
    expect(within(round('More or Less')).queryByRole('button', { name: /^Move / })).toBeNull()
  })

  it('stops calling a mode upcoming once the server plays it', async () => {
    const shipped = { ...PACING[0]!, types: ['pick_from_list'] }
    vi.mocked(api.getModes).mockResolvedValue([
      ...structuredClone(PACING),
      { ...shipped, id: 'scrying_pool' },
      { ...shipped, id: 'minimap_guesser' },
    ])
    await loaded()
    expect(screen.queryByText('Scrying Pool')).toBeNull()
    expect(screen.queryByText('Minimap Guesser')).toBeNull()
    for (const id of ['scrying_pool', 'minimap_guesser']) {
      expect((screen.getByRole('checkbox', { name: id }) as HTMLInputElement).checked).toBe(false)
    }
    expect(
      screen.getByText("What's That Noise?").closest('li')?.classList.contains('upcoming'),
    ).toBe(true)
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

  it('puts the random events and the host’s own questions on a step of their own', async () => {
    await loaded(...BOTH)
    expect(screen.queryByRole('group', { name: 'Random events frequency' })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Write your own' })).toBeNull()
    await tab('Random events')
    expect(screen.getByRole('group', { name: 'Random events frequency' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Write your own' })).toBeTruthy()
    expect(screen.queryByRole('checkbox', { name: 'More or Less' })).toBeNull()
    expect(screen.queryByRole('list', { name: 'Who might turn up' })).toBeNull()
  })

  it('lets the host pick how often, says what each means, and offers no way off', async () => {
    await loaded(...BOTH)
    await tab('Random events')
    const choice = screen.getByRole('group', { name: 'Random events frequency' })
    expect(
      within(choice)
        .getAllByRole('radio')
        .map((radio) => radio.closest('label')?.textContent?.replace(/\s+/g, ' ').trim()),
    ).toEqual(['Less 1 per 20', 'Default 1 per 10', 'More 1 per 5'])
    await fireEvent.click(within(choice).getByRole('radio', { name: /^More/ }))
    expect((await submitted()).random_event_frequency).toBe('more')
  })

  it('counts the events in this game, and what the host wrote fills them first', async () => {
    await loaded('More or Less')
    await press(round('More or Less'), 'More questions', 15)
    await tab('Random events')
    const events = screen.getByRole('region', { name: 'Random events' })
    expect(events.textContent).toContain('2 in this game')
    expect(events.textContent).toContain('All of them will be a surprise.')
    const own = screen.getByRole('region', { name: 'Write your own' })
    await press(own, 'Write a question')
    const form = screen.getByRole('group', { name: 'New question' })
    await fireEvent.input(within(form).getByRole('textbox', { name: 'Question' }), {
      target: { value: 'Who runs the inn?' },
    })
    await fireEvent.input(within(form).getByRole('textbox', { name: 'Answer 1' }), {
      target: { value: 'Hans' },
    })
    await fireEvent.input(within(form).getByRole('textbox', { name: 'Answer 2' }), {
      target: { value: 'Bob' },
    })
    await press(form, 'Add question')
    expect(events.textContent).toContain('1 written by you, 1 surprise')
  })

  it('keeps everything set on a tab when the host moves between them', async () => {
    await loaded('More or Less')
    await tab('Random events')
    await fireEvent.click(screen.getByRole('radio', { name: /^Less/ }))
    await tab('Rounds')
    expect(
      (screen.getByRole('checkbox', { name: 'More or Less' }) as HTMLInputElement).checked,
    ).toBe(true)
    await tab('Random events')
    expect((screen.getByRole('radio', { name: /^Less/ }) as HTMLInputElement).checked).toBe(true)
  })

  it('keeps what was set through a reload, until the doors open', async () => {
    await loaded('More or Less')
    await fireEvent.click(radioIn('Who can join', 'Public'))
    cleanup()
    await loaded()
    expect(
      (screen.getByRole('checkbox', { name: 'More or Less' }) as HTMLInputElement).checked,
    ).toBe(true)
    expect(radioIn('Who can join', 'Public').checked).toBe(true)
    await submitted()
    cleanup()
    await loaded()
    expect(status()).toBe('None yet')
  })

  it('names who got it wrong unless the host turns it off', async () => {
    await loaded(...BOTH)
    expect((await submitted()).name_wrong_answers).toBe(true)
  })

  it('sends the house rules as set', async () => {
    await loaded(...BOTH)
    await tab('House rules')
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
    const surprise = screen.getByRole('switch', { name: 'Surprise rounds' })
    expect(surprise.getAttribute('aria-checked')).toBe('false')
    await fireEvent.click(surprise)
    expect((await submitted()).hide_rounds).toBe(true)
  })

  it('sends no teams unless the host turns the team game on', async () => {
    await loaded(...BOTH)
    expect(screen.queryByRole('checkbox', { name: 'Saradomin' })).toBeNull()
    expect((await submitted()).teams).toEqual([])
  })

  it('starts a team game on Saradomin and Zamorak, each god with its logo and name', async () => {
    await loaded(...BOTH)
    await teamGame()
    const gods = screen.getByRole('group', { name: 'Gods' })
    expect(
      within(gods)
        .getAllByRole('checkbox')
        .map((box) => box.closest('label')?.textContent?.trim()),
    ).toEqual(['Saradomin', 'Zamorak', 'Guthix', 'Armadyl', 'Bandos', 'Zaros'])
    expect(gods.querySelectorAll('.logo .logo')).toHaveLength(6)
    expect(ticked()).toEqual(['Saradomin', 'Zamorak'])
  })

  it('sends the ticked gods in their own order, whatever order they were ticked in', async () => {
    await loaded(...BOTH)
    await teamGame()
    await pick('Zaros', 'Guthix', 'Saradomin')
    await pick('Bandos')
    expect((await submitted()).teams).toEqual(['zamorak', 'guthix', 'bandos', 'zaros'])
  })

  it('keeps the doors shut with a hint when fewer than two gods are ticked', async () => {
    await loaded(...BOTH)
    await teamGame()
    await pick('Zamorak')
    expect(document.querySelector('.doors')?.textContent).toContain(
      'Pick at least two gods for a team game.',
    )
    expect(createButton().disabled).toBe(true)
    await pick('Bandos')
    expect(createButton().disabled).toBe(false)
  })

  it('sends no teams once the switch is off again, whatever is ticked', async () => {
    await loaded(...BOTH)
    await teamGame()
    await pick('Zamorak')
    await fireEvent.click(radioIn('How to play', 'Free for all'))
    expect(createButton().disabled).toBe(false)
    expect((await submitted()).teams).toEqual([])
  })

  it('lets anyone with the code in unless the host picks the link or the public list', async () => {
    await loaded(...BOTH)
    const choice = screen.getByRole('group', { name: 'Who can join' })
    const radio = (name: string): HTMLInputElement =>
      within(choice).getByRole('radio', { name }) as HTMLInputElement
    expect(radio('Room code').checked).toBe(true)
    expect(choice.nextElementSibling?.textContent).toBe(
      'Anyone you give the room code to can join.',
    )
    await fireEvent.click(radio('Invite link'))
    expect(choice.nextElementSibling?.textContent).toBe(
      "The room code alone won't let anyone in — they'll need the invite link or your approval.",
    )
    await fireEvent.click(radio('Public'))
    expect(radio('Invite link').checked).toBe(false)
    expect(choice.nextElementSibling?.textContent).toBe(
      'Listed on the homepage so anyone can join.',
    )
    await submitted()
    expect(vi.mocked(api.createRoom).mock.calls[0]![4]).toBe('public')
  })

  it('says how many questions the room plays, events included, before it exists', async () => {
    // One mode of ten at the default plays eleven, and Create says so.
    await loaded('More or Less')
    await press(round('More or Less'), 'More questions', 5)
    expect(status()).toBe('1 round · 11 questions · ~3 min')
    expect(document.querySelector('.tally')?.textContent).toBe(
      '10 questions in the rounds, plus 1 random event.',
    )
    await tab('Random events')
    await fireEvent.click(screen.getByRole('radio', { name: /^Less/ }))
    expect(status()).toBe('1 round · 10 questions · ~3 min')
    await fireEvent.click(screen.getByRole('radio', { name: /^More/ }))
    expect(status()).toBe('1 round · 12 questions · ~3 min')
  })

  it('estimates the minutes from each mode’s typical question, the pace, the events and the breaks', async () => {
    vi.mocked(api.getModes).mockResolvedValue([
      ...structuredClone(PACING),
      {
        id: 'random_event',
        types: [],
        questions: null,
        seconds: { walk: 40, run: 30, teleport: 20 },
        as_of: null,
      },
    ])
    await loaded(...BOTH)
    await press(round('More or Less'), 'More questions', 5)
    // 10 × 15 + 5 × 12, one event of 30, two splashes of 15, 10 s of standings and a
    // second for the names on each of the 16 reveals: 296 s.
    expect(status()).toBe('2 rounds · 16 questions · ~5 min')
    await tab('House rules')
    await fireEvent.click(screen.getByRole('radio', { name: 'Teleport' }))
    // 10 × 11 + 5 × 9 + 20 + 30 + 10 + 16: 231 s.
    expect(status()).toBe('2 rounds · 16 questions · ~4 min')
    await tab('House rules')
    await press(document.body, 'Fewer standings seconds', 2)
    // 221 s.
    expect(status()).toBe('2 rounds · 16 questions · ~4 min')
    const names = screen.getByRole('group', { name: 'Name who got it wrong' })
    await fireEvent.click(within(names).getByRole('radio', { name: 'Off' }))
    // 205 s.
    expect(status()).toBe('2 rounds · 16 questions · ~3 min')
  })

  it('counts the events against the cap, as the server does', async () => {
    await loaded(...BOTH)
    await press(round('More or Less'), 'More questions', 25)
    expect(status()).toBe('2 rounds · 38 questions · ~10 min')
  })

  it('sends how long the standings hold between rounds, 10 unless changed', async () => {
    await loaded(...BOTH)
    expect((await submitted()).standings_seconds).toBe(10)
  })

  it('steps the standings by five, from 0 for none to 30', async () => {
    const page = document.body
    await loaded(...BOTH)
    await tab('House rules')
    await press(page, 'More standings seconds', 4)
    expect(screen.getByRole('button', { name: 'More standings seconds' })).toHaveProperty(
      'disabled',
      true,
    )
    await press(page, 'Fewer standings seconds', 6)
    expect(screen.getByRole('button', { name: 'Fewer standings seconds' })).toHaveProperty(
      'disabled',
      true,
    )
    expect((await submitted()).standings_seconds).toBe(0)
  })

  it('sends the run pace unless changed, and no reveal of its own', async () => {
    await loaded(...BOTH)
    await tab('House rules')
    expect(screen.getByRole('radio', { name: 'Run' })).toHaveProperty('checked', true)
    expect(screen.queryByRole('button', { name: 'More reveal seconds' })).toBeNull()
    const settings = await submitted()
    expect(settings.pace).toBe('run')
    expect(settings).not.toHaveProperty('reveal_seconds')
  })

  it('offers walk, run and teleport, and sends the one picked', async () => {
    await loaded(...BOTH)
    await tab('House rules')
    for (const name of ['Walk', 'Run', 'Teleport'])
      expect(screen.getByRole('radio', { name })).toBeTruthy()
    await fireEvent.click(screen.getByRole('radio', { name: 'Teleport' }))
    expect(screen.getByText('Faster timers for players who know their stuff.')).toBeTruthy()
    expect((await submitted()).pace).toBe('teleport')
  })

  it('sends mixed questions unless changed', async () => {
    await loaded(...BOTH)
    expect((await submitted()).difficulty).toBe('mixed')
  })

  it('offers easy, mixed and hard questions, and sends the one picked', async () => {
    await loaded(...BOTH)
    await tab('House rules')
    for (const name of ['Easy', 'Mixed', 'Hard'])
      expect(screen.getByRole('radio', { name })).toBeTruthy()
    await fireEvent.click(screen.getByRole('radio', { name: 'Hard' }))
    expect(screen.getByText('Leaves out the easiest questions.')).toBeTruthy()
    expect((await submitted()).difficulty).toBe('hard')
  })

  it('remembers the room it created until the server says it expires', async () => {
    await loaded(...BOTH)
    await submitted()
    await waitFor(() =>
      expect(createdRooms(Date.parse('2098-12-31T23:59:59Z'))).toEqual(['ABYSSAL']),
    )
    expect(createdRooms(Date.parse('2099-01-01T00:00:00Z'))).toEqual([])
  })
})

describe('Writing a question', () => {
  it('opens in a wide pop-up, which Cancel closes', async () => {
    await loaded(...BOTH)
    await tab('Random events')
    await fireEvent.click(screen.getByRole('button', { name: 'Write a question' }))
    const sheet = screen.getByRole('dialog', { name: 'New question' })
    expect(sheet.classList.contains('wide')).toBe(true)
    expect(within(sheet).getByRole('group', { name: 'New question' })).toBeTruthy()
    await press(sheet, 'Cancel')
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('Create, picking for the host', () => {
  /** Open "Pick for me", step the count `by` from where it starts, and Pick. */
  async function pickForMe(by = 0, surprise = false): Promise<void> {
    await fireEvent.click(screen.getByRole('button', { name: 'Pick for me' }))
    const dialog = screen.getByRole('dialog', { name: 'Pick for me' })
    if (by !== 0) await press(dialog, by < 0 ? 'Fewer game modes' : 'More game modes', Math.abs(by))
    const secret = within(dialog).queryByRole('checkbox', { name: 'Keep them a surprise' })
    if (secret !== null && (secret as HTMLInputElement).checked !== surprise) {
      await fireEvent.click(secret)
    }
    await press(dialog, 'Pick')
  }

  async function hideRounds(): Promise<void> {
    await fireEvent.click(screen.getByRole('switch', { name: 'Surprise rounds' }))
  }

  it('keeps picks a surprise only in a room that hides its rounds', async () => {
    await loaded()
    await fireEvent.click(screen.getByRole('button', { name: 'Pick for me' }))
    const dialog = screen.getByRole('dialog', { name: 'Pick for me' })
    expect(within(dialog).queryByRole('checkbox')).toBeNull()
    await press(dialog, 'Cancel')
    await hideRounds()
    await fireEvent.click(screen.getByRole('button', { name: 'Pick for me' }))
    expect(screen.getByRole('checkbox', { name: 'Keep them a surprise' })).toBeTruthy()
  })

  it('brings the cards back when the room stops hiding its rounds', async () => {
    await loaded()
    await hideRounds()
    await pickForMe(-1, true)
    expect(screen.queryByRole('checkbox', { name: 'More or Less' })).toBeNull()
    await hideRounds()
    expect(screen.getByRole('checkbox', { name: 'More or Less' })).toBeTruthy()
  })

  it('suggests four modes to begin with', async () => {
    const more = ['guess_examine', 'sort_it_out', 'who_said_that'].map((id) => ({
      ...PACING[0]!,
      id,
    }))
    vi.mocked(api.getModes).mockResolvedValue([...structuredClone(PACING), ...more])
    await loaded()
    await fireEvent.click(screen.getByRole('button', { name: 'Pick for me' }))
    expect(within(screen.getByRole('dialog')).getByText('4')).toBeTruthy()
  })

  it('ticks as many modes as asked at random, in place of the ones ticked', async () => {
    await loaded('More or Less')
    await pickForMe()
    expect(screen.queryByRole('dialog')).toBeNull()
    const settings = await submitted()
    expect(settings.modes.map((round) => round.mode).sort()).toEqual([
      'more_less',
      'price_is_right',
    ])
    expect(settings).not.toHaveProperty('surprise_modes')
  })

  it('replaces what was ticked with a fresh draw at the modes own length', async () => {
    await loaded(...BOTH)
    await pickForMe(-1)
    const settings = await submitted()
    expect(settings.modes).toHaveLength(1)
    expect(settings.modes[0]!.questions).toBe(5)
  })

  it('changes nothing on Cancel', async () => {
    await loaded('More or Less')
    await fireEvent.click(screen.getByRole('button', { name: 'Pick for me' }))
    await press(screen.getByRole('dialog'), 'Cancel')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect((await submitted()).modes.map((round) => round.mode)).toEqual(['more_less'])
  })

  it('offers no more than there are modes to pick', async () => {
    await loaded()
    await fireEvent.click(screen.getByRole('button', { name: 'Pick for me' }))
    const more = within(screen.getByRole('dialog')).getByRole('button', { name: 'More game modes' })
    expect(more).toHaveProperty('disabled', true)
  })

  it('folds the cards away for a surprise, counts the rounds unseen, and sends only how many', async () => {
    await loaded('More or Less')
    await hideRounds()
    await pickForMe(-1, true)
    expect(screen.queryByRole('checkbox', { name: /^More or Less/ })).toBeNull()
    expect(screen.queryByRole('group', { name: 'Round order' })).toBeNull()
    expect(screen.getByText('1 surprise round, drawn when the game starts')).toBeTruthy()
    expect(screen.getByRole('region', { name: "Tonight's game" }).textContent).toContain(
      '1 surprise round',
    )
    await fireEvent.click(createButton())
    await waitFor(() => expect(api.createRoom).toHaveBeenCalledOnce())
    const sent = vi.mocked(api.createRoom).mock.calls[0]![1]
    expect(sent).not.toHaveProperty('modes')
    expect(sent.surprise_modes).toBe(1)
    expect(sent.hide_rounds).toBe(true)
    expect(sent.mode_order).toBe('random')
  })

  it('estimates a surprise from the average round at the shortest draw', async () => {
    await loaded()
    await hideRounds()
    await pickForMe(0, true)
    // Two rounds of five at 13.5 s, one event at the same, two splashes and one standings: 188.5 s.
    expect(status()).toBe('2 surprise rounds · at least 11 questions · ~3 min')
  })

  it('brings the cards back when the host would rather choose', async () => {
    await loaded()
    await hideRounds()
    await pickForMe(0, true)
    await fireEvent.click(screen.getByRole('button', { name: 'Choose the rounds instead' }))
    await pick('More or Less')
    const settings = await submitted()
    expect(settings.modes).toHaveLength(1)
    expect(settings).not.toHaveProperty('surprise_modes')
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
    const banner = await screen.findByText(/You already have 5 rooms open/)
    expect(banner.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'You already have 5 rooms open. Remove one on the homepage to create another.',
    )
    expect(screen.queryByRole('button', { name: 'Open the doors' })).toBeNull()
    await fireEvent.click(within(banner).getByRole('link', { name: 'homepage' }))
    expect(navigate).toHaveBeenCalledWith('/')
    expect(api.createRoom).not.toHaveBeenCalled()
  })

  it('lets the sixth through once one is removed on the homepage', async () => {
    render(Home, { navigate: vi.fn() })
    const rune = screen.getByText('RUNE').closest('li')!
    await fireEvent.click(within(rune).getByRole('button', { name: 'Remove room RUNE' }))
    await fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove' }),
    )
    await waitFor(() => expect(createdRooms()).not.toContain('RUNE'))
    cleanup()
    await loaded(...BOTH)
    await submitted()
  })

  it.each([404, 410])(
    'drops a room that answers %i from the list rather than counting it',
    async (status) => {
      vi.mocked(api.getRoom).mockImplementation(async (code) => {
        if (code === 'ZULRAH') throw new api.ApiFailure(status, 'gone', 'gone')
        return { status: 'lobby', players: 1 }
      })
      await loaded(...BOTH)
      await submitted()
      expect(createdRooms()).not.toContain('ZULRAH')
    },
  )

  it('counts a room it could not check, since nothing says it is gone', async () => {
    vi.mocked(api.getRoom).mockRejectedValue(new api.ApiFailure(429, 'rate_limited', 'slow down'))
    render(Create, { navigate: () => {} })
    expect(await screen.findByText(/You already have 5 rooms open/)).toBeTruthy()
    expect(createdRooms()).toHaveLength(5)
  })

  it('refuses at submit when another tab filled the list since the form loaded', async () => {
    const [last, ...four] = HOSTED
    localStorage.clear()
    for (const code of four) rememberCreated(code, '2099-01-01T00:00:00Z')
    await loaded(...BOTH)
    await waitFor(() => expect(createButton().disabled).toBe(false))
    rememberCreated(last!, '2099-01-01T00:00:00Z')
    await fireEvent.click(createButton())
    expect(await screen.findByText(/You already have 5 rooms open/)).toBeTruthy()
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
