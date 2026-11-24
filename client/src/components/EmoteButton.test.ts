/** The Emotes button and its tab: a pick sends and closes it, and the button rests 3 s after. */

import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { EMOTE_MS, clearEmotes, noteEmote } from '../lib/emotes'
import { roomShown, type RoomFit } from '../lib/roomFit'
import EmoteButton from './EmoteButton.svelte'

let sent: string[] = []

function button(): HTMLButtonElement {
  return screen.getByRole('button', { name: 'Emotes' })
}

async function pick(name: string): Promise<void> {
  await fireEvent.click(button())
  await fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name }))
}

beforeEach(() => {
  sent = []
  vi.useFakeTimers()
  render(EmoteButton, {
    send: (emote: string) => {
      sent.push(emote)
      return true
    },
  })
})

afterEach(() => {
  cleanup()
  clearEmotes()
  roomShown.set(null)
  vi.useRealTimers()
})

describe('EmoteButton', () => {
  it('opens the emote tab: the eight, in order', async () => {
    await fireEvent.click(button())
    const tab = screen.getByRole('dialog', { name: 'Emotes' })
    expect(
      within(tab)
        .getAllByRole('button')
        .map((b) => b.textContent?.trim()),
    ).toEqual(['Wave', 'Cheer', 'Clap', 'Laugh', 'Think', 'Panic', 'Cry', 'Angry'])
  })

  it('sends a pick and closes the tab', async () => {
    await pick('Panic')
    expect(sent).toEqual(['panic'])
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('closes on Escape without sending', async () => {
    await fireEvent.click(button())
    await fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(sent).toEqual([])
  })

  it('is held from the tap, and let go after 3 s when no frame comes', async () => {
    await pick('Wave')
    expect(button().disabled).toBe(true)
    await vi.advanceTimersByTimeAsync(EMOTE_MS)
    expect(button().disabled).toBe(false)
  })

  it('is held for 3 s from the frame, with the shade draining', async () => {
    await pick('Wave')
    await vi.advanceTimersByTimeAsync(1000)
    noteEmote({ t: 'emote', player_id: 'you', emote: 'wave', line: 0 }, 'you')
    await vi.advanceTimersByTimeAsync(EMOTE_MS - 1)
    expect(button().disabled).toBe(true)
    expect(button().querySelector('.drain')).not.toBeNull()
    await vi.advanceTimersByTimeAsync(1)
    expect(button().disabled).toBe(false)
    expect(button().querySelector('.drain')).toBeNull()
  })

  it('says the limit on a desktop only', async () => {
    expect(screen.queryByText('One every 3 seconds.')).toBeNull()
    roomShown.set({ fit: {} as RoomFit })
    await vi.advanceTimersByTimeAsync(0)
    expect(screen.getByText('One every 3 seconds.')).toBeTruthy()
  })
})
