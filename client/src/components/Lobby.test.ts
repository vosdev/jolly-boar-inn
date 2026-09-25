/**
 * The host's lobby controls. Start anyway, Kick and Promote all ask in the page first,
 * not through `window.confirm`, which some in-app browsers answer no to unasked.
 */

import { fireEvent, render, screen, within } from '@testing-library/svelte'
import { beforeEach, describe, expect, it } from 'vitest'

import type { PlayerView, RoomView } from '../lib/protocol'
import { applyServerMessage, resetRoom } from '../lib/stores'
import type { RoomSocket } from '../lib/ws'
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
    random_event_seconds: 2,
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

function lobby(): void {
  resetRoom()
  applyServerMessage({
    t: 'welcome',
    room: ROOM,
    you: HOST,
    players: [HOST, WOOX],
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

  it('labels the players link and the code with the field they belong to', () => {
    lobby()
    const field = document.getElementById('join-link')
    expect(field?.tagName).toBe('INPUT')
    expect(document.querySelector('label[for="join-link"]')).not.toBeNull()
    expect(screen.getByLabelText('Link for players')).toBe(field)
  })

  it('says a refusal in its own words', async () => {
    lobby()
    applyServerMessage({ t: 'error', code: 'not_admin', message: 'only an admin can do that' })
    expect(await screen.findByText('Only a host can do that.')).toBeTruthy()
  })
})
