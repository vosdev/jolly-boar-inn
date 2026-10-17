/**
 * The lobby: a stage with the room code, and a grid of pets under it. The host's controls
 * ask in the page first, not through `window.confirm`, which some in-app browsers answer
 * no to unasked.
 */

import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { npcArt } from '../lib/npcs'
import type { PlayerView, RoomView } from '../lib/protocol'
import { applyServerMessage, resetRoom } from '../lib/stores'
import type { RoomSocket } from '../lib/ws'
import { petsDrawn } from '../test-pets'
import Lobby from './Lobby.svelte'

const HOST: PlayerView = { id: 'a', display_name: 'Zezima', role: 'admin', connected: true }
const WOOX: PlayerView = { id: 'b', display_name: 'Woox', role: 'player', connected: true }

const ROOM: RoomView = {
  code: 'ABYSSAL',
  status: 'lobby',
  settings: {
    modes: [{ mode: 'more_less', questions: 5 }],
    mode_order: 'listed',
    random_event_frequency: 'default',
    pace: 'run',
    standings_seconds: 10,
    close_when_all_answered: true,
    max_players: 50,
  },
  current_index: null,
  total: 5,
  events: 0,
  phase: 'idle',
  next_at: null,
  reveal_seconds: null,
  estimated_seconds: 300,
  segment: null,
  finished_at: null,
}

let sent: unknown[] = []

/** A surprise room as a player is sent it: no modes, until a round starts. */
const SECRET: RoomView = {
  ...ROOM,
  settings: { ...ROOM.settings, modes: [], hide_rounds: true },
  total: 42,
  events: 2,
  rounds: 5,
}

function lobby(players: PlayerView[] = [HOST, WOOX], room: RoomView = ROOM, you: PlayerView = HOST): void {
  resetRoom()
  applyServerMessage({
    t: 'welcome',
    room,
    you,
    players,
    question: null,
    your_answer: null,
    standings: [],
    server_time: new Date().toISOString(),
    server_version: __APP_VERSION__,
  })
  const socket = {
    send: (message: unknown) => {
      sent.push(message)
      return true
    },
  } as unknown as RoomSocket
  render(Lobby, { socket })
}

function dialog(): HTMLElement {
  return screen.getByRole('dialog')
}

/** The pet an admin taps to kick or promote its player. */
function tile(name: string): HTMLElement {
  return screen.getByRole('button', { name: new RegExp(`^${name}, .*kick or make host$`) })
}

function clipboard(writeText: ReturnType<typeof vi.fn> | undefined): void {
  Object.defineProperty(navigator, 'clipboard', {
    value: writeText === undefined ? undefined : { writeText },
    configurable: true,
  })
}

function pets(): HTMLElement[] {
  return within(screen.getByRole('list', { name: /^Players/ })).getAllByRole('listitem')
}

/** How a pet in the grid is drawn: ready, away, both or neither. */
function looks(pet: HTMLElement): { lit: boolean; away: boolean } {
  const drawn = pet.querySelector('.roster-pet') as HTMLElement
  return { lit: drawn.classList.contains('lit'), away: drawn.classList.contains('away') }
}

beforeEach(() => {
  sent = []
})

describe('Lobby', () => {
  it("explains how to play the room's own ways of answering", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          Response.json([
            { id: 'more_less', types: ['more_less'], questions: null, seconds: null, as_of: null },
            { id: 'sort_it_out', types: ['ordering'], questions: null, seconds: null, as_of: null },
          ]),
        ),
      ),
    )
    lobby()
    await fireEvent.click(screen.getByRole('button', { name: 'How to play' }))
    const sheet = screen.getByRole('dialog', { name: 'How to play' })
    await within(sheet).findByRole('heading', { name: 'One answer' })
    expect(within(sheet).getAllByRole('heading', { level: 3 })).toHaveLength(1)
    await fireEvent.click(within(sheet).getByRole('button', { name: 'Got it' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    vi.unstubAllGlobals()
  })

  it('kicks from the pet the host taps, the choice being its own confirmation', async () => {
    lobby()
    await fireEvent.click(tile('Woox'))
    expect(sent).toEqual([])
    expect(dialog().textContent).toContain('Kick Woox, or make them a host?')
    await fireEvent.click(within(dialog()).getByRole('button', { name: 'Kick' }))
    expect(sent).toEqual([{ t: 'kick', player_id: 'b' }])
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('asks once more before making a host, which cannot be undone', async () => {
    lobby()
    await fireEvent.click(tile('Woox'))
    await fireEvent.click(within(dialog()).getByRole('button', { name: 'Make host…' }))
    expect(sent).toEqual([])
    expect(dialog().textContent).toContain("Make Woox a host? This can't be undone.")
    await fireEvent.click(within(dialog()).getByRole('button', { name: 'Make host' }))
    expect(sent).toEqual([{ t: 'promote', player_id: 'b' }])
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('sends start_game below the threshold only once the host confirms', async () => {
    lobby()
    await fireEvent.click(screen.getByRole('button', { name: 'Start anyway' }))
    expect(sent).toEqual([])
    expect(dialog().textContent).toContain('Start anyway? Still waiting on you and Woox.')
    await fireEvent.click(within(dialog()).getByRole('button', { name: 'Start anyway' }))
    expect(sent).toEqual([{ t: 'start_game' }])
  })

  it.each([
    ['a pet', () => tile('Woox')],
    ['Make host', null],
    ['Start anyway', () => screen.getByRole('button', { name: 'Start anyway' })],
  ])('sends nothing when %s is cancelled', async (_, open) => {
    lobby()
    const show = async () => {
      if (open !== null) return fireEvent.click(open())
      await fireEvent.click(tile('Woox'))
      await fireEvent.click(within(dialog()).getByRole('button', { name: 'Make host…' }))
    }
    await show()
    await fireEvent.click(within(dialog()).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    await show()
    await fireEvent(dialog(), new Event('cancel'))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(sent).toEqual([])
  })

  it('offers kick and promote on nobody’s pet to a player, nor on a host’s to a host', () => {
    lobby([HOST, WOOX], ROOM, WOOX)
    expect(screen.queryByRole('button', { name: /kick or make host/ })).toBeNull()
    cleanup()
    lobby([HOST, WOOX, { ...WOOX, id: 'c', display_name: 'Lynx', role: 'admin' }])
    expect(screen.getAllByRole('button', { name: /kick or make host/ })).toHaveLength(1)
  })

  it('stands the Wise Old Man, without a hero in the branding, beside a scroll that holds the heading, the code and the night', () => {
    lobby()
    expect([...document.querySelectorAll('.stage .npc img')].map((img) => img.getAttribute('src'))).toEqual([
      npcArt('wise_old_man').url,
    ])
    const paper = document.querySelector('.paper') as HTMLElement
    expect(within(paper).getByRole('heading', { level: 1, name: 'Lobby' })).toBeTruthy()
    expect(within(paper).getByRole('button', { name: 'ABYSSAL, copy the invite link' })).toBeTruthy()
    expect(within(paper).getByText('1 round · 5 questions · Run pace · ~5 min')).toBeTruthy()
  })

  it('copies an invite-only room’s whole link from the code, and never draws its key', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    clipboard(writeText)
    lobby([HOST, WOOX], { ...ROOM, key: 'abc_DEF-123' })
    expect(screen.getByRole('status').textContent).toBe('')
    await fireEvent.click(screen.getByRole('button', { name: 'ABYSSAL, copy the invite link' }))
    expect(writeText).toHaveBeenCalledWith(`${location.origin}/r/ABYSSAL#k=abc_DEF-123`)
    expect(await screen.findByText('Link copied')).toBeTruthy()
    expect(document.body.innerHTML).not.toContain('abc_DEF-123')
  })

  it('copies a room without a key by its plain link', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    clipboard(writeText)
    lobby()
    await fireEvent.click(screen.getByRole('button', { name: 'ABYSSAL, copy the invite link' }))
    expect(writeText).toHaveBeenCalledWith(`${location.origin}/r/ABYSSAL`)
  })

  it.each([
    ['refuses', vi.fn().mockRejectedValue(new Error('denied'))],
    ['is missing', undefined],
  ])('says so and shows the link to copy by hand when the clipboard %s', async (_, writeText) => {
    clipboard(writeText)
    lobby([HOST, WOOX], { ...ROOM, key: 'abc' })
    await fireEvent.click(screen.getByRole('button', { name: 'ABYSSAL, copy the invite link' }))
    expect((await screen.findByRole('alert')).textContent).toBe(
      "Couldn't copy the link. Copy it from here:",
    )
    const field = screen.getByRole('textbox', { name: 'Link for players' }) as HTMLInputElement
    expect(field.value).toBe(`${location.origin}/r/ABYSSAL#k=abc`)
    expect(screen.queryByText('Link copied')).toBeNull()
  })

  it('sends rotate_key only once the host confirms a new link', async () => {
    lobby([HOST, WOOX], { ...ROOM, key: 'abc' })
    await fireEvent.click(screen.getByRole('button', { name: 'New link' }))
    expect(sent).toEqual([])
    expect(dialog().textContent).toContain('The current one stops working. Players already here stay.')
    await fireEvent.click(within(dialog()).getByRole('button', { name: 'New link' }))
    expect(sent).toEqual([{ t: 'rotate_key' }])
  })

  it('offers no new link for a room without a key, nor to a player', () => {
    lobby()
    expect(screen.queryByRole('button', { name: 'New link' })).toBeNull()
    cleanup()
    lobby([HOST, WOOX], { ...ROOM, key: 'abc' }, WOOX)
    expect(screen.queryByRole('button', { name: 'New link' })).toBeNull()
  })

  it('lists who is asking to join, and lets them in or turns them away without asking', async () => {
    const requests = [
      { id: 'r1', display_name: 'Lynx Titan', avatar: 'aggy' },
      { id: 'r2', display_name: 'Durial', avatar: null },
    ]
    lobby([HOST, WOOX], { ...ROOM, key: 'abc', requests })
    const panel = screen.getByRole('region', { name: 'Asking to join (2)' })
    const rows = within(panel).getAllByRole('listitem')
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining('Lynx Titan'),
      expect.stringContaining('Durial'),
    ])
    await fireEvent.click(within(rows[0]!).getByRole('button', { name: 'Let in' }))
    await fireEvent.click(within(rows[1]!).getByRole('button', { name: 'Turn away' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(sent).toEqual([
      { t: 'decide_request', request_id: 'r1', accept: true },
      { t: 'decide_request', request_id: 'r2', accept: false },
    ])
  })

  it('shows no request panel when nobody is asking', () => {
    lobby([HOST, WOOX], { ...ROOM, key: 'abc', requests: [] })
    expect(screen.queryByText(/Asking to join/)).toBeNull()
  })

  it('starts at once, asking nothing, when enough of the room is ready', async () => {
    lobby([{ ...HOST, ready: true }, WOOX])
    await fireEvent.click(screen.getByRole('button', { name: 'Start the game' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(sent).toEqual([{ t: 'start_game' }])
  })

  it('counts only who is connected toward Start, and names the rest', async () => {
    const away: PlayerView = { id: 'c', display_name: 'Lynx', role: 'player', connected: false }
    lobby([{ ...HOST, ready: true }, WOOX, { ...away, ready: true }])
    await fireEvent.click(screen.getByRole('button', { name: 'Start the game' }))
    expect(sent).toEqual([{ t: 'start_game' }])
  })

  it('draws each player’s own pet, or the innkeeper for none, at 48px as the splash does', () => {
    lobby([{ ...HOST, avatar: 'baby_mole' }, { ...WOOX, avatar: null }])
    expect(petsDrawn(screen.getByRole('list', { name: /^Players/ }))).toEqual([
      { pet: 'baby_mole', size: 48 },
      { pet: '', size: 48 },
    ])
  })

  it('names who is not ready to the host, and lights who is', () => {
    const lynx: PlayerView = { id: 'c', display_name: 'Lynx', role: 'player', connected: true }
    lobby([{ ...HOST, ready: true }, WOOX, lynx])
    expect(screen.getByText('Waiting on Woox and Lynx.')).toBeTruthy()
    expect(pets().map((pet) => [looks(pet).lit, pet.textContent])).toEqual([
      [true, expect.stringContaining('Zezima')],
      [false, expect.stringContaining('Woox')],
      [false, expect.stringContaining('Lynx')],
    ])
  })

  it('outlines a ready pet and fades an away one, ready or not', () => {
    const lynx: PlayerView = { id: 'c', display_name: 'Lynx', role: 'player', connected: false }
    lobby([{ ...HOST, ready: true }, WOOX, lynx, { ...lynx, id: 'd', display_name: 'Cow', ready: true }])
    expect(pets().map(looks)).toEqual([
      { lit: true, away: false },
      { lit: false, away: false },
      { lit: false, away: true },
      { lit: true, away: true },
    ])
    expect(tile('Lynx').getAttribute('aria-label')).toBe('Lynx, away, not ready: kick or make host')
  })

  it('shows the code as the server spells it', () => {
    lobby([HOST], { ...ROOM, code: 'AbyssalWhip07' })
    expect(screen.getByRole('button', { name: 'AbyssalWhip07, copy the invite link' }).textContent).toContain(
      'AbyssalWhip07',
    )
  })

  it('says under each pet who hosts, who is away and which is you', () => {
    const lynx: PlayerView = { id: 'c', display_name: 'Lynx', role: 'player', connected: false }
    lobby([HOST, WOOX, lynx])
    expect(pets().map((pet) => pet.querySelector('.status')?.textContent ?? '')).toEqual([
      'host · you',
      '',
      'away',
    ])
  })

  it('says who is picking a name, dims them, and counts them as before', () => {
    lobby([{ ...HOST, ready: true }, { ...WOOX, editing: true }])
    const [host, woox] = pets()
    expect(woox?.textContent).toContain('picking a name…')
    expect(woox?.classList.contains('editing')).toBe(true)
    expect(host?.textContent).not.toContain('picking a name…')
    expect(screen.getByRole('list', { name: 'Players, 1 of 2 ready' })).toBeTruthy()
    expect(screen.getByText('Waiting on Woox.')).toBeTruthy()
  })

  it('tells a player the host starts, on the scroll, and gives them no Start', () => {
    lobby([HOST, WOOX], ROOM, WOOX)
    const paper = document.querySelector('.paper') as HTMLElement
    expect(within(paper).getByText('Waiting for the host to start…')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Start/ })).toBeNull()
  })

  it.each([
    [1, '3 rounds · 15 questions · 1 random event · Run pace · ~5 min'],
    [3, '3 rounds · 15 questions · 3 random events · Run pace · ~5 min'],
  ])('counts %i random events apart from the rounds’ questions', (events, line) => {
    const modes = [
      { mode: 'more_less', questions: 5 },
      { mode: 'drop_table', questions: 5 },
      { mode: 'sort_it_out', questions: 5 },
    ]
    lobby([HOST, WOOX], { ...ROOM, settings: { ...ROOM.settings, modes }, total: 15 + events, events })
    expect(screen.getByText(line)).toBeTruthy()
  })

  it('keeps the rounds behind a button, listed A–Z once it is pressed', async () => {
    const modes = [
      { mode: 'more_less', questions: 5 },
      { mode: 'drop_table', questions: 1 },
    ]
    lobby([HOST, WOOX], { ...ROOM, settings: { ...ROOM.settings, modes }, total: 6 })
    expect(screen.getByText('2 rounds · 6 questions · Run pace · ~5 min')).toBeTruthy()
    const toggle = screen.getByRole('button', { name: 'Show the rounds' })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText('More or Less')).toBeNull()
    await fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    const rows = within(document.getElementById('rounds')!).getAllByRole('listitem')
    expect(rows.map((row) => row.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
      'Drop Table 1 question',
      'More or Less 5 questions',
    ])
    expect(screen.getByText('Listed A–Z, not in the order they play.')).toBeTruthy()
    await fireEvent.click(screen.getByRole('button', { name: 'Hide the rounds' }))
    expect(screen.queryByText('More or Less')).toBeNull()
  })

  it('gives the server’s estimate of the game in whole minutes', () => {
    lobby([HOST, WOOX], { ...ROOM, estimated_seconds: 1290 })
    expect(screen.getByText('1 round · 5 questions · Run pace · ~22 min')).toBeTruthy()
  })

  it('names the pace the host picked', () => {
    lobby([HOST, WOOX], { ...ROOM, settings: { ...ROOM.settings, pace: 'teleport' } })
    expect(screen.getByText('1 round · 5 questions · Teleport pace · ~5 min')).toBeTruthy()
  })

  it.each([
    ['player', WOOX, SECRET],
    // The host is sent every round, and the lobby still keeps them off a shared screen.
    ['host', HOST, { ...SECRET, settings: { ...SECRET.settings, modes: ROOM.settings.modes } }],
  ])('counts surprise rounds for the %s and offers none to show', (_, you, room) => {
    lobby([HOST, WOOX], room, you)
    expect(screen.getByText('5 secret rounds · 40 questions · 2 random events · Run pace · ~5 min')).toBeTruthy()
    expect(
      screen.getByText("Tonight's rounds are a surprise. Each one is revealed when it starts."),
    ).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Show the rounds' })).toBeNull()
    expect(screen.queryByText('More or Less')).toBeNull()
  })

  it('says a refusal in its own words', async () => {
    lobby()
    applyServerMessage({ t: 'error', code: 'not_admin', message: 'only an admin can do that' })
    expect(await screen.findByText('Only a host can do that.')).toBeTruthy()
  })
})
