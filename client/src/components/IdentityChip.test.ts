/**
 * The chip: the head it draws, a rename the room refuses, the join-first nudge, and a
 * rename the room never answers, which the popover waits a few seconds for, says so and
 * lets the player try again, and which any `welcome`, `error` or leaving the room ends.
 */

import { fireEvent, render, screen } from '@testing-library/svelte'
import { tick } from 'svelte'
import { get } from 'svelte/store'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { derivedHead } from '../lib/heads'
import { nudge, profile } from '../lib/profile'
import type { ClientMessage, PlayerView, RoomView } from '../lib/protocol'
import { applyServerMessage, resetRoom, roomSend } from '../lib/stores'
import { headsDrawn } from '../test-heads'
import IdentityChip from './IdentityChip.svelte'

const me: PlayerView = {
  id: 'p1',
  display_name: 'Zezima',
  avatar: 3,
  role: 'player',
  connected: true,
  ready: false,
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
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  resetRoom()
  sent = []
  roomSend.set((message) => {
    sent.push(message)
    return true
  })
})

afterEach(() => {
  roomSend.set(null)
  nudge.set(null)
  vi.useRealTimers()
})

const LOBBY: RoomView = {
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

function welcome(you: PlayerView): void {
  applyServerMessage({
    t: 'welcome',
    room: LOBBY,
    you,
    players: [you],
    question: null,
    your_answer: null,
    standings: [],
    server_time: new Date(0).toISOString(),
    server_version: __APP_VERSION__,
  })
}

describe('IdentityChip', () => {
  it('draws the profile’s head outside a room, at 32px', () => {
    profile.set({ name: 'Zezima', head: 5 })
    render(IdentityChip, { live: null })
    expect(headsDrawn(document.querySelector('.chip')!)).toEqual([{ head: 5, size: 32 }])
  })

  it('draws the head the room knows inside one, or the one the id gives', async () => {
    const chip = render(IdentityChip, { live: me })
    expect(headsDrawn(document.querySelector('.chip')!)).toEqual([{ head: 3, size: 32 }])
    await chip.rerender({ live: { ...me, avatar: null } })
    expect(headsDrawn(document.querySelector('.chip')!)).toEqual([
      { head: derivedHead(me.id), size: 32 },
    ])
  })

  it('answers a name the room already has in the popover, and keeps the old one', async () => {
    profile.set({ name: 'Zezima', head: 3 })
    render(IdentityChip, { live: me })
    await rename('Woox')
    applyServerMessage({ t: 'error', code: 'name_taken', message: 'that name is taken' })
    await tick()
    expect(screen.getByRole('alert').textContent).toBe('Somebody in this room already has that name.')
    expect(screen.getByRole('button', { name: /^You are Zezima/ })).toBeTruthy()
    expect(get(profile)?.name).toBe('Zezima')
  })

  it('nudges a player who joined first, in that room’s lobby, until dismissed', async () => {
    welcome(me)
    nudge.set('ABYSSAL')
    render(IdentityChip, { live: me })
    expect(screen.getByRole('status').textContent).toContain("You're Zezima — tap to change.")
    await fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByRole('status')).toBeNull()
    expect(get(nudge)).toBeNull()
  })
})

describe('IdentityChip in a room', () => {
  it('stops waiting on a rename nobody answers, says so, and lets it be tried again', async () => {
    render(IdentityChip, { live: me })
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
    render(IdentityChip, { live: me })
    await rename('Woox')
    applyServerMessage({ t: 'error', code: 'bad_state', message: 'wait a moment' })
    await tick()
    expect(waiting()).toBeNull()
    expect(save().disabled).toBe(false)
  })

  it('stops waiting on a welcome', async () => {
    render(IdentityChip, { live: me })
    await rename('Woox')
    applyServerMessage({
      t: 'welcome',
      room: null as never,
      you: me,
      players: [me],
      question: null,
      your_answer: null,
      standings: [],
      server_time: new Date(0).toISOString(),
      server_version: __APP_VERSION__,
    })
    await tick()
    expect(waiting()).toBeNull()
  })

  it('stops waiting when the room is left', async () => {
    const chip = render(IdentityChip, { live: me })
    await rename('Woox')
    expect(waiting()).toBeTruthy()
    await chip.rerender({ live: null })
    expect(waiting()).toBeNull()
  })
})
