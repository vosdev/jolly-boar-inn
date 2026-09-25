/**
 * The chip's rename inside a room when the room never answers: the popover waits a few
 * seconds, says so and lets the player try again, and any `welcome`, `error` or leaving
 * the room ends the wait at once.
 */

import { fireEvent, render, screen } from '@testing-library/svelte'
import { tick } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ClientMessage, PlayerView } from '../lib/protocol'
import { applyServerMessage, resetRoom, roomSend } from '../lib/stores'
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
  vi.useRealTimers()
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
