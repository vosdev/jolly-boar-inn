/**
 * The host's lobby controls. Start anyway, Kick and Promote all ask in the page first,
 * not through `window.confirm`, which some in-app browsers answer no to unasked.
 */

import { fireEvent, render, screen, within } from '@testing-library/svelte'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { derivedHead } from '../lib/heads'
import type { PlayerView, RoomView } from '../lib/protocol'
import { applyServerMessage, resetRoom } from '../lib/stores'
import type { RoomSocket } from '../lib/ws'
import { headsDrawn } from '../test-heads'
import Lobby from './Lobby.svelte'

const HOST: PlayerView = { id: 'a', display_name: 'Zezima', role: 'admin', connected: true }
const WOOX: PlayerView = { id: 'b', display_name: 'Woox', role: 'player', connected: true }

const ROOM: RoomView = {
  code: 'ABYSSAL',
  status: 'lobby',
  settings: {
    modes: [{ mode: 'more_less', questions: 5, seconds: 10 }],
    mode_order: 'listed',
    random_event_frequency: 'default',
    reveal_seconds: 8,
    splash_seconds: 0,
    standings_seconds: 10,
    close_when_all_answered: true,
    max_players: 50,
  },
  current_index: null,
  total: 5,
  phase: 'idle',
  next_at: null,
  segment: null,
  finished_at: null,
}

let sent: unknown[] = []

/** A surprise room as a player is sent it: no modes, until a round starts. */
const SECRET: RoomView = {
  ...ROOM,
  settings: { ...ROOM.settings, modes: [], hide_rounds: true },
  total: 42,
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

beforeEach(() => {
  sent = []
})

describe('Lobby', () => {
  it.each([
    ['Kick', 'Remove Woox from the room?', 'Kick', { t: 'kick', player_id: 'b' }],
    [
      'Promote',
      "Make Woox a host? This can't be undone.",
      'Make host',
      { t: 'promote', player_id: 'b' },
    ],
    ['Start anyway', 'Start anyway? Still waiting on you and Woox.', 'Start anyway', { t: 'start_game' }],
  ])('sends %s only once the host confirms', async (button, question, yes, message) => {
    lobby()
    await fireEvent.click(screen.getByRole('button', { name: button }))
    expect(sent).toEqual([])
    expect(dialog().textContent).toContain(question)
    await fireEvent.click(within(dialog()).getByRole('button', { name: yes }))
    expect(sent).toEqual([message])
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it.each(['Kick', 'Promote', 'Start anyway'])('sends nothing when %s is cancelled', async (button) => {
    lobby()
    await fireEvent.click(screen.getByRole('button', { name: button }))
    await fireEvent.click(within(dialog()).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    await fireEvent.click(screen.getByRole('button', { name: button }))
    await fireEvent(dialog(), new Event('cancel'))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(sent).toEqual([])
  })

  it('shows an invite-only room’s link with its key as asterisks, and copies the real one', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    lobby([HOST, WOOX], { ...ROOM, key: 'abc_DEF-123' })
    const field = screen.getByRole('textbox', { name: 'Link for players' }) as HTMLInputElement
    expect(field.value).toBe(`${location.origin}/r/ABYSSAL#k=${'*'.repeat(11)}`)
    await fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
    expect(writeText).toHaveBeenCalledWith(`${location.origin}/r/ABYSSAL#k=abc_DEF-123`)
    expect(field.value).not.toContain('abc_DEF-123')
  })

  it('sends rotate_key only once the host confirms a new link', async () => {
    lobby([HOST, WOOX], { ...ROOM, key: 'abc' })
    await fireEvent.click(screen.getByRole('button', { name: 'New link' }))
    expect(sent).toEqual([])
    expect(dialog().textContent).toContain('The current one stops working. Players already here stay.')
    await fireEvent.click(within(dialog()).getByRole('button', { name: 'New link' }))
    expect(sent).toEqual([{ t: 'rotate_key' }])
  })

  it('offers no new link for a room without a key', () => {
    lobby()
    expect(screen.queryByRole('button', { name: 'New link' })).toBeNull()
    const field = screen.getByRole('textbox', { name: 'Link for players' }) as HTMLInputElement
    expect(field.value).toBe(`${location.origin}/r/ABYSSAL`)
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

  it('draws each player’s own head, or the one their id gives, at 32px', () => {
    lobby([{ ...HOST, avatar: 7 }, { ...WOOX, avatar: null }])
    expect(headsDrawn(document.querySelector('.players')!)).toEqual([
      { head: 7, size: 32 },
      { head: derivedHead(WOOX.id), size: 32 },
    ])
  })

  it('names who is not ready, and marks who is', () => {
    const lynx: PlayerView = { id: 'c', display_name: 'Lynx', role: 'player', connected: true }
    lobby([{ ...HOST, ready: true }, WOOX, lynx])
    expect(screen.getByText('Waiting on Woox and Lynx.')).toBeTruthy()
    const rows = within(screen.getAllByRole('list').at(-1)!).getAllByRole('listitem')
    expect(rows.map((row) => [row.textContent?.includes('✓ ready'), row.textContent])).toEqual([
      [true, expect.stringContaining('Zezima')],
      [false, expect.stringContaining('Woox')],
      [false, expect.stringContaining('Lynx')],
    ])
  })

  it('says who is picking a name, dims them, and counts them as before', () => {
    lobby([{ ...HOST, ready: true }, { ...WOOX, editing: true }])
    const [host, woox] = within(screen.getAllByRole('list').at(-1)!).getAllByRole('listitem')
    expect(woox?.textContent).toContain('picking a name…')
    expect(woox?.classList.contains('editing')).toBe(true)
    expect(host?.textContent).not.toContain('picking a name…')
    expect(screen.getByText('1 of 2 ready')).toBeTruthy()
    expect(screen.getByText('Waiting on Woox.')).toBeTruthy()
  })

  it('names the players link by its own label alone, not the room code', () => {
    lobby()
    const field = screen.getByLabelText('Link for players') as HTMLInputElement
    expect([...(field.labels ?? [])].map((label) => label.textContent)).toEqual([
      'Link for players',
    ])
    expect(screen.queryByLabelText('Room code')).toBeNull()
    expect(screen.getByText('Room code')).toBeTruthy()
  })

  it('lists the rounds A–Z in a room without surprise rounds', () => {
    lobby()
    expect(screen.getByText('1 round · 5 questions · 8s reveal')).toBeTruthy()
    expect(screen.getByText('More or Less')).toBeTruthy()
  })

  it.each([
    ['player', WOOX, SECRET],
    // The host is sent every round, and the lobby still keeps them off a shared screen.
    ['host', HOST, { ...SECRET, settings: { ...SECRET.settings, modes: ROOM.settings.modes } }],
  ])('counts surprise rounds for the %s and names none', (_, you, room) => {
    lobby([HOST, WOOX], room, you)
    expect(screen.getByText('5 secret rounds · 42 questions · 8s reveal')).toBeTruthy()
    expect(
      screen.getByText("Tonight's rounds are a surprise. Each one is revealed when it starts."),
    ).toBeTruthy()
    expect(screen.queryByText('More or Less')).toBeNull()
  })

  it('says a refusal in its own words', async () => {
    lobby()
    applyServerMessage({ t: 'error', code: 'not_admin', message: 'only an admin can do that' })
    expect(await screen.findByText('Only a host can do that.')).toBeTruthy()
  })
})
