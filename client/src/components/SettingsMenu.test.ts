/**
 * The bar's one control and its menu: the pet it draws, a rename the room refuses, the
 * and a rename the room never answers, which the menu waits a few
 * seconds for, says so and lets the player try again, and which any `welcome`, `error` or
 * leaving the room ends. Then the menu as a whole: every setting the three old popovers
 * held, the keyboard, and the theme list, which offers the themes and nothing that follows
 * the device, shows jolly to a browser that never chose, and repaints the moment one is
 * picked, emblem and all. In a room it renames only in the lobby, and tells the room while
 * its name field has focus there, so the others see "picking a name…".
 */

import { fireEvent, render, screen, within } from '@testing-library/svelte'
import { tick } from 'svelte'
import { get } from 'svelte/store'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { profile } from '../lib/profile'
import type { ClientMessage, PlayerView, RoomView } from '../lib/protocol'
import { applyServerMessage, connection, resetRoom, roomSend } from '../lib/stores'
import { EMBLEMS } from '../lib/emblems'
import { THEME_LABELS, THEMES } from '../lib/theme'
import { petsDrawn } from '../test-pets'
import SettingsMenu from './SettingsMenu.svelte'

// The emblems are checked by their placeholders, which a checkout with the icons fetched
// would replace.
vi.mock('../lib/emblems', async (original) => ({
  ...(await original<typeof import('../lib/emblems')>()),
  emblemFile: () => null,
}))

const me: PlayerView = {
  id: 'p1',
  display_name: 'Zezima',
  avatar: 'abyssal_orphan',
  role: 'player',
  connected: true,
  ready: false,
  editing: false,
  team: null,
}

let sent: ClientMessage[]

const save = () => screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement
const waiting = () => screen.queryByText('Asking the room…')

async function rename(to: string): Promise<void> {
  await fireEvent.click(screen.getByRole('button', { name: /^You are Zezima/ }))
  await fireEvent.input(screen.getByRole('textbox'), { target: { value: to } })
  await fireEvent.submit(save().form!)
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
  resetRoom()
  sent = []
  roomSend.set((message) => {
    sent.push(message)
    return true
  })
})

afterEach(() => {
  roomSend.set(null)
  profile.set(null)
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const LOBBY: RoomView = {
  code: 'ABYSSAL',
  status: 'lobby',
  settings: {
    modes: [{ mode: 'more_less', questions: 5 }],
    mode_order: 'listed',
    random_event_frequency: 'default',
    pace: 'run',
    difficulty: 'mixed',
    standings_seconds: 10,
    close_when_all_answered: true,
    max_players: 50,
    name_wrong_answers: false,
    teams: [],
  },
  current_index: null,
  total: 5,
  events: 0,
  phase: 'idle',
  next_at: null,
  reveal_seconds: null,
  estimated_seconds: 0,
  segment: null,
  finished_at: null,
}

function welcome(you: PlayerView, room: RoomView = LOBBY): void {
  applyServerMessage({
    t: 'welcome',
    room,
    you,
    players: [you],
    question: null,
    your_answer: null,
    standings: [],
    team_standings: null,
    server_time: new Date(0).toISOString(),
    server_version: __APP_VERSION__,
  })
}

describe('SettingsMenu', () => {
  it('draws the profile’s pet outside a room, at 32px', () => {
    profile.set({ name: 'Zezima', pet: 'aggy' })
    render(SettingsMenu, { live: null })
    expect(petsDrawn(document.querySelector('.chip')!)).toEqual([{ pet: 'aggy', size: 32 }])
  })

  it('draws the pet the room knows inside one, or the innkeeper for none', async () => {
    const chip = render(SettingsMenu, { live: me })
    expect(petsDrawn(document.querySelector('.chip')!)).toEqual([
      { pet: 'abyssal_orphan', size: 32 },
    ])
    await chip.rerender({ live: { ...me, avatar: null } })
    expect(petsDrawn(document.querySelector('.chip')!)).toEqual([{ pet: '', size: 32 }])
  })

  it('answers a name the room already has in the menu, and keeps the old one', async () => {
    profile.set({ name: 'Zezima', pet: 'abyssal_orphan' })
    welcome(me)
    render(SettingsMenu, { live: me })
    await rename('Woox')
    applyServerMessage({ t: 'error', code: 'name_taken', message: 'that name is taken' })
    await tick()
    expect(screen.getByRole('alert').textContent).toBe(
      'Somebody in this room already has that name.',
    )
    expect(screen.getByRole('button', { name: /^You are Zezima/ })).toBeTruthy()
    expect(get(profile)?.name).toBe('Zezima')
  })
})

describe('SettingsMenu in a room', () => {
  beforeEach(() => welcome(me))

  it('stops waiting on a rename nobody answers, says so, and lets it be tried again', async () => {
    render(SettingsMenu, { live: me })
    await rename('Woox')
    expect(sent).toEqual([{ t: 'set_profile', display_name: 'Woox' }])
    expect(waiting()).toBeTruthy()
    expect(save().disabled).toBe(true)

    await vi.advanceTimersByTimeAsync(4_999)
    expect(waiting()).toBeTruthy()
    await vi.advanceTimersByTimeAsync(1)
    await tick()
    expect(waiting()).toBeNull()
    expect(screen.getByRole('alert').textContent).toBe("The room didn't answer. Try again.")
    expect(save().disabled).toBe(false)
    await fireEvent.submit(save().form!)
    expect(sent).toHaveLength(2)
  })

  it('stops waiting on any error that arrives after the send', async () => {
    render(SettingsMenu, { live: me })
    await rename('Woox')
    applyServerMessage({ t: 'error', code: 'bad_state', message: 'wait a moment' })
    await tick()
    expect(waiting()).toBeNull()
    expect(save().disabled).toBe(false)
  })

  it('stops waiting on a welcome', async () => {
    render(SettingsMenu, { live: me })
    await rename('Woox')
    applyServerMessage({
      t: 'welcome',
      room: null as never,
      you: me,
      players: [me],
      question: null,
      your_answer: null,
      standings: [],
      team_standings: null,
      server_time: new Date(0).toISOString(),
      server_version: __APP_VERSION__,
    })
    await tick()
    expect(waiting()).toBeNull()
  })

  it('stops waiting when the room is left', async () => {
    const chip = render(SettingsMenu, { live: me })
    await rename('Woox')
    expect(waiting()).toBeTruthy()
    await chip.rerender({ live: null })
    expect(waiting()).toBeNull()
  })
})

describe('SettingsMenu, picking a name', () => {
  const editing = () => sent.filter((message) => message.t === 'editing')

  beforeEach(() => {
    welcome(me)
    connection.set('open')
    // Like the real socket, which sends nothing until it is welcomed again.
    roomSend.set((message) => get(connection) === 'open' && sent.push(message) > 0)
  })

  afterEach(() => connection.set('connecting'))

  async function focusName(): Promise<void> {
    screen.getByRole('textbox').focus()
    await tick()
  }

  it('says nothing for an open menu, only while the name field has focus', async () => {
    render(SettingsMenu, { live: me })
    await fireEvent.click(control())
    expect(editing()).toEqual([])
    await focusName()
    expect(editing()).toEqual([{ t: 'editing', on: true }])
    screen.getByRole('textbox').blur()
    await tick()
    expect(editing()).toEqual([
      { t: 'editing', on: true },
      { t: 'editing', on: false },
    ])
  })

  it('takes it back when the menu closes with the name field in focus', async () => {
    render(SettingsMenu, { live: me })
    await fireEvent.click(control())
    await focusName()
    await fireEvent.keyDown(window, { key: 'Escape' })
    expect(editing().at(-1)).toEqual({ t: 'editing', on: false })
  })

  it('says it again every 30 seconds while focused, so it never lapses', async () => {
    render(SettingsMenu, { live: me })
    await fireEvent.click(control())
    await focusName()
    await vi.advanceTimersByTimeAsync(29_999)
    expect(editing()).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(editing()).toHaveLength(2)
    await fireEvent.keyDown(window, { key: 'Escape' })
    await vi.advanceTimersByTimeAsync(60_000)
    expect(editing()).toHaveLength(3) // the off, and nothing after it
  })

  it('says it again after a reconnect, which cleared it on the server', async () => {
    render(SettingsMenu, { live: me })
    await fireEvent.click(control())
    await focusName()
    connection.set('reconnecting')
    await tick()
    connection.set('open')
    await tick()
    expect(editing().map((message) => message.t === 'editing' && message.on)).toEqual([true, true])
  })

  it('goes quiet after a save the room accepts, until the name is touched again', async () => {
    const chip = render(SettingsMenu, { live: me })
    await fireEvent.click(control())
    await focusName()
    await fireEvent.input(screen.getByRole('textbox'), { target: { value: 'Woox' } })
    await fireEvent.submit(save().form!)
    const renamed = { ...me, display_name: 'Woox' }
    applyServerMessage({ t: 'room_updated', room: LOBBY, players: [renamed] })
    await chip.rerender({ live: renamed })
    await tick()
    expect(editing().at(-1)).toEqual({ t: 'editing', on: false })
    const quiet = editing().length
    await vi.advanceTimersByTimeAsync(30_000)
    expect(editing()).toHaveLength(quiet)
    await fireEvent.input(screen.getByRole('textbox'), { target: { value: 'Woox Jr' } })
    expect(editing().at(-1)).toEqual({ t: 'editing', on: true })
  })

  it('disables the rename once the game has started, and tells the room nothing', async () => {
    welcome(me, { ...LOBBY, status: 'playing', phase: 'open', current_index: 0 })
    render(SettingsMenu, { live: me })
    await fireEvent.click(control())
    const name = screen.getByRole('textbox') as HTMLInputElement
    expect(name.value).toBe('Zezima')
    expect(name.matches(':disabled')).toBe(true)
    expect(save().matches(':disabled')).toBe(true)
    for (const name of ['Random', 'Change pet']) {
      expect(screen.getByRole('button', { name }).matches(':disabled')).toBe(true)
    }
    expect(screen.getByText('Names are fixed once the game has started.')).toBeTruthy()
    await fireEvent.submit(save().form!)
    expect(sent).toEqual([])
  })

  it('tells the room nothing outside one', async () => {
    render(SettingsMenu, { live: null })
    await fireEvent.click(control())
    expect(editing()).toEqual([])
  })
})

const control = () => screen.getByRole('button', { name: /Open settings$/ })
const menu = () => screen.queryByRole('dialog', { name: 'Settings' })
const radios = () => screen.getAllByRole('radio') as HTMLInputElement[]
const barEmblem = () =>
  control().querySelector<SVGElement>('[data-placeholder]')?.dataset.placeholder

async function opened(live: PlayerView | null = null): Promise<void> {
  render(SettingsMenu, { live })
  await fireEvent.click(control())
  await tick()
}

describe('SettingsMenu, the menu', () => {
  beforeEach(() => {
    localStorage.clear()
    delete document.documentElement.dataset.theme
  })

  it('shows the pet, the name and the current theme’s emblem in one control', () => {
    profile.set({ name: 'Zezima', pet: 'aggy' })
    localStorage.setItem('jbi:theme', 'pollnivneach')
    render(SettingsMenu, { live: null })
    expect(control().getAttribute('aria-label')).toBe(
      'You are Zezima, theme Pollnivneach. Open settings',
    )
    expect(control().querySelector('.chip-name')!.textContent).toBe('Zezima')
    expect(barEmblem()).toBe('pollnivneach')
  })

  it('reaches the name, the pet, both sound switches and every theme from one panel', async () => {
    profile.set({ name: 'Zezima', pet: 'aggy' })
    await opened()
    const panel = within(menu()!)
    expect(panel.getByRole('heading', { name: 'You' })).toBeTruthy()
    expect(panel.getByRole('textbox')).toBeTruthy()
    expect(panel.getByRole('button', { name: 'Change pet' })).toBeTruthy()
    expect(panel.getByRole('button', { name: 'Random' })).toBeTruthy()
    expect(panel.getByRole('button', { name: 'Save' })).toBeTruthy()
    expect(panel.getByRole('heading', { name: 'Sound' })).toBeTruthy()
    expect(panel.getByRole('button', { name: 'Music & effects' })).toBeTruthy()
    expect(panel.getByRole('button', { name: 'Question audio' })).toBeTruthy()
    expect(panel.getByRole('group', { name: 'Theme' })).toBeTruthy()
    expect(panel.getAllByRole('radio')).toHaveLength(EMBLEMS.length)
  })

  it('saves the local profile outside a room, from the panel', async () => {
    profile.set({ name: 'Zezima', pet: 'aggy' })
    await opened()
    await fireEvent.input(screen.getByRole('textbox'), { target: { value: 'Woox' } })
    await fireEvent.submit(save().form!)
    expect(get(profile)).toEqual({ name: 'Woox', pet: 'aggy' })
    expect(sent).toEqual([])
  })

  it('saves a pet picked from the grid to the local profile outside a room', async () => {
    profile.set({ name: 'Zezima', pet: 'aggy' })
    await opened()
    await fireEvent.click(screen.getByRole('button', { name: 'Change pet' }))
    await fireEvent.click(screen.getByRole('radio', { name: 'Baby Mole' }))
    await fireEvent.submit(save().form!)
    expect(get(profile)).toEqual({ name: 'Zezima', pet: 'baby_mole' })
    expect(sent).toEqual([])
  })

  it('sends a pet picked in a room as the avatar, and keeps the old one until the room agrees', async () => {
    welcome(me)
    await opened(me)
    await fireEvent.click(screen.getByRole('button', { name: 'Change pet' }))
    await fireEvent.click(screen.getByRole('radio', { name: 'Baby Mole' }))
    await fireEvent.submit(save().form!)
    expect(sent).toEqual([{ t: 'set_profile', avatar: 'baby_mole' }])
    expect(petsDrawn(control())).toEqual([{ pet: 'abyssal_orphan', size: 32 }])
  })

  it('offers Save only once the pet or the name differs from what the room has', async () => {
    welcome(me)
    await opened(me)
    expect(save().matches(':disabled')).toBe(true)
    await fireEvent.click(screen.getByRole('button', { name: 'Change pet' }))
    await fireEvent.click(screen.getByRole('radio', { name: 'Baby Mole' }))
    expect(save().matches(':disabled')).toBe(false)
    await fireEvent.click(screen.getByRole('radio', { name: 'Abyssal orphan' }))
    expect(save().matches(':disabled')).toBe(true)
  })

  it('opens with focus in the panel, and Escape closes it and gives focus back', async () => {
    await opened()
    expect(menu()!.contains(document.activeElement)).toBe(true)
    expect(control().getAttribute('aria-expanded')).toBe('true')
    await fireEvent.keyDown(window, { key: 'Escape' })
    expect(menu()).toBeNull()
    expect(document.activeElement).toBe(control())
  })

  it('closes on a tap outside, and gives focus back when the tap landed on nothing', async () => {
    await opened()
    await fireEvent.pointerDown(document.body)
    expect(menu()).toBeNull()
    vi.runAllTimers()
    expect(document.activeElement).toBe(control())
  })

  it('leaves focus on whatever focusable thing the tap outside landed on', async () => {
    const answer = document.body.appendChild(document.createElement('button'))
    await opened()
    await fireEvent.pointerDown(answer)
    answer.focus()
    vi.runAllTimers()
    expect(menu()).toBeNull()
    expect(document.activeElement).toBe(answer)
    answer.remove()
  })

  it('closes when the keyboard tabs out of it', async () => {
    const next = document.body.appendChild(document.createElement('button'))
    await opened()
    await fireEvent.focusOut(screen.getByRole('textbox'), { relatedTarget: next })
    expect(menu()).toBeNull()
    next.remove()
  })

  it('stays open for a tap inside it', async () => {
    await opened()
    await fireEvent.pointerDown(screen.getByRole('heading', { name: 'Sound' }))
    expect(menu()).toBeTruthy()
  })
})

describe('SettingsMenu, the themes', () => {
  beforeEach(() => {
    localStorage.clear()
    delete document.documentElement.dataset.theme
    // A phone set to dark, which nothing here may follow.
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('dark'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }))
  })

  it('offers exactly the themes, by name and in order, and no follow-my-device entry', async () => {
    await opened()
    const offered = radios().filter((radio) => !radio.disabled)
    expect(offered.map((radio) => radio.value)).toEqual([...THEMES])
    const names = offered.map((radio) => radio.closest('label')!.textContent!.trim())
    expect(names).toEqual(THEMES.map((theme) => THEME_LABELS[theme].name))
  })

  it('puts the light themes first and the dark ones after, each with its emblem, nothing disabled', async () => {
    await opened()
    expect(radios().filter((radio) => radio.disabled)).toEqual([])
    expect(radios().map((radio) => radio.value)).toEqual([
      'jolly',
      'pollnivneach',
      'jungle',
      'party_room',
      'tzhaar',
      'wilderness',
      'gauntlet',
      'corrupted_gauntlet',
      'morytania',
    ])
    for (const radio of radios().slice(1)) {
      await fireEvent.click(radio)
      expect(document.documentElement.dataset.theme).toBe(radio.value)
      expect(barEmblem()).toBe(radio.value)
    }
  })

  it('shows jolly selected to a browser that never chose, on a dark device too', async () => {
    await opened()
    expect(
      radios()
        .filter((radio) => radio.checked)
        .map((radio) => radio.value),
    ).toEqual(['jolly'])
    expect(control().getAttribute('aria-label')).toContain('theme Jolly Boar Inn.')
    expect(barEmblem()).toBe('jolly')
  })

  it('shows the stored choice selected', async () => {
    localStorage.setItem('jbi:theme', 'wilderness')
    await opened()
    expect(radios().find((radio) => radio.checked)?.value).toBe('wilderness')
  })

  it('draws each emblem on a tile in its own theme, its name for a screen reader only', async () => {
    await opened()
    const rows = radios().map((radio) => radio.closest('label')!)
    expect(rows.map((row) => row.querySelector<HTMLElement>('.tile')?.dataset.theme)).toEqual([
      ...EMBLEMS,
    ])
    expect(
      rows.map((row) => row.querySelector<SVGElement>('[data-placeholder]')?.dataset.placeholder),
    ).toEqual([...EMBLEMS])
    for (const row of rows) {
      expect(
        [...row.querySelectorAll('span')].filter((span) => span.textContent!.trim() !== ''),
      ).toEqual([row.querySelector('.sr')])
    }
  })

  it('writes the chosen theme’s name under the grid, and follows a new pick', async () => {
    localStorage.setItem('jbi:theme', 'wilderness')
    await opened()
    const group = screen.getByRole('group', { name: 'Theme' })
    const shown = () => group.querySelector('.current')!.textContent
    expect(shown()).toBe('Wilderness')
    await fireEvent.click(radios().find((radio) => radio.value === 'morytania')!)
    expect(shown()).toBe('Morytania')
  })

  it('repaints at once, changes the bar’s emblem, stays open, and remembers', async () => {
    await opened()
    await fireEvent.click(radios()[1]!)
    expect(document.documentElement.dataset.theme).toBe('pollnivneach')
    expect(localStorage.getItem('jbi:theme')).toBe('pollnivneach')
    expect(menu()).toBeTruthy()
    expect(barEmblem()).toBe('pollnivneach')
    expect(control().getAttribute('aria-label')).toContain('theme Pollnivneach.')
    expect(radios()[1]!.checked).toBe(true)
  })

  it('still repaints with storage throwing, and starts on jolly', async () => {
    const denied = (): never => {
      throw new DOMException('The operation is insecure.', 'SecurityError')
    }
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(denied)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(denied)
    await opened()
    expect(radios().find((radio) => radio.checked)?.value).toBe('jolly')
    await fireEvent.click(radios().find((radio) => radio.value === 'wilderness')!)
    expect(document.documentElement.dataset.theme).toBe('wilderness')
  })
})
