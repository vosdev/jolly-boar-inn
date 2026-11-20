/** The Sound section: the warning for question audio, and what a TV room says. */

import { fireEvent, render, screen } from '@testing-library/svelte'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { PlayerView } from '../lib/protocol'
import { players, resetRoom, you } from '../lib/stores'
import SoundChip from './SoundChip.svelte'
import SoundSettings from './SoundSettings.svelte'

function player(id: string, role: PlayerView['role']): PlayerView {
  return {
    id,
    display_name: id,
    avatar: null,
    role,
    team: null,
    connected: true,
    ready: false,
    editing: false,
    item: null,
  }
}

function seat(self: PlayerView, others: PlayerView[]): void {
  you.set(self)
  players.set([self, ...others])
}

beforeEach(() => localStorage.clear())
afterEach(() => resetRoom())

describe('SoundSettings', () => {
  it('warns once Question audio is off', async () => {
    render(SoundSettings)
    const question = screen.getByRole('button', { name: 'Question audio' })
    expect(question.getAttribute('aria-pressed')).toBe('true')
    expect(screen.queryByText(/audio-only/)).toBeNull()

    await fireEvent.click(question)
    expect(question.getAttribute('aria-pressed')).toBe('false')
    expect(
      screen.getByText("Some rounds are audio-only, so you won't be able to hear the clues."),
    ).toBeTruthy()
  })

  it('tells a phone in a TV room that the TV plays, with its switches off but free', async () => {
    seat(player('you', 'player'), [player('tv', 'tv')])
    render(SoundSettings)
    expect(screen.getByText('The TV plays the sound in this room.')).toBeTruthy()
    const effects = screen.getByRole('button', { name: 'Music & effects' })
    expect(effects.getAttribute('aria-pressed')).toBe('false')
    await fireEvent.click(effects)
    expect(effects.getAttribute('aria-pressed')).toBe('true')
  })

  it('fixes the TV’s switches on', () => {
    seat(player('tv', 'tv'), [player('ann', 'player')])
    render(SoundSettings)
    for (const name of ['Music & effects', 'Question audio']) {
      const button = screen.getByRole('button', { name }) as HTMLButtonElement
      expect(button.getAttribute('aria-pressed')).toBe('true')
      expect(button.disabled).toBe(true)
    }
    expect(screen.getByText('The TV always plays sound.')).toBeTruthy()
  })
})

describe('SoundChip', () => {
  it('asks for a tap until the page has had one', async () => {
    const { listenForUnlock } = await import('../lib/audio')
    listenForUnlock()
    render(SoundChip)
    expect(screen.getByRole('button', { name: 'Tap for sound' })).toBeTruthy()
    await fireEvent.pointerDown(window)
    expect(screen.queryByRole('button', { name: 'Tap for sound' })).toBeNull()
  })
})
