/**
 * The host's lobby controls. Start anyway, Kick and Promote all ask in the page first,
 * not through `window.confirm`, which some in-app browsers answer no to unasked.
 */

import { fireEvent, render, screen, within } from '@testing-library/svelte'
import { beforeEach, describe, expect, it } from 'vitest'

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
}

let sent: unknown[] = []

function lobby(players: PlayerView[] = [HOST, WOOX]): void {
  resetRoom()
  applyServerMessage({
    t: 'welcome',
    room: ROOM,
    you: HOST,
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

  it('names the players link by its own label alone, not the room code', () => {
    lobby()
    const field = screen.getByLabelText('Link for players') as HTMLInputElement
    expect([...(field.labels ?? [])].map((label) => label.textContent)).toEqual([
      'Link for players',
    ])
    expect(screen.queryByLabelText('Room code')).toBeNull()
    expect(screen.getByText('Room code')).toBeTruthy()
  })

  it('says a refusal in its own words', async () => {
    lobby()
    applyServerMessage({ t: 'error', code: 'not_admin', message: 'only an admin can do that' })
    expect(await screen.findByText('Only a host can do that.')).toBeTruthy()
  })
})
