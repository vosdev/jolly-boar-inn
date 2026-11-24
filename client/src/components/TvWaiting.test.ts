/** The TV's panel beside an open question: who is still to answer, and the faces that have. */

import { cleanup, render, screen } from '@testing-library/svelte'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { clearEmotes, noteEmote } from '../lib/emotes'
import type { PlayerView } from '../lib/protocol'
import { answerCount, players } from '../lib/stores'
import TvWaiting from './TvWaiting.svelte'

function player(id: string, extra: Partial<PlayerView> = {}): PlayerView {
  return {
    id,
    display_name: id,
    avatar: null,
    role: 'player',
    team: null,
    connected: true,
    ready: false,
    editing: false,
    item: null,
    ...extra,
  }
}

afterEach(() => {
  cleanup()
  clearEmotes()
  answerCount.set(null)
  players.set([])
  vi.useRealTimers()
})

describe('TvWaiting', () => {
  function faces(): string[] {
    return [...screen.getByRole('list', { name: 'Answered' }).querySelectorAll('[role="img"]')].map(
      (face) => face.getAttribute('aria-label') ?? '',
    )
  }

  it('shows the faces of those who answered under the ones still to answer', () => {
    players.set([player('Woox'), player('Lynx'), player('Zezima'), player('Tv', { role: 'tv' })])
    answerCount.set({ answered: 2, of: 3, waiting: ['Lynx'] })
    render(TvWaiting)
    expect(screen.getByText('Waiting on').nextElementSibling?.textContent).toContain('Lynx')
    expect(faces()).toEqual(['Woox', 'Zezima'])
  })

  it('leaves out a player who dropped, and the whole row when nobody can answer', () => {
    players.set([player('Woox'), player('Lynx', { connected: false })])
    answerCount.set({ answered: 1, of: 1, waiting: [] })
    const { unmount } = render(TvWaiting)
    expect(faces()).toEqual(['Woox'])
    unmount()
    answerCount.set({ answered: 0, of: 0, waiting: [] })
    render(TvWaiting)
    expect(screen.queryByRole('list', { name: 'Answered' })).toBeNull()
  })

  it('shows an answered player’s emote over their face', async () => {
    vi.useFakeTimers()
    players.set([player('Woox'), player('Lynx')])
    answerCount.set({ answered: 1, of: 2, waiting: ['Lynx'] })
    const { container } = render(TvWaiting)
    noteEmote({ t: 'emote', player_id: 'Woox', emote: 'cheer', line: 0 }, null)
    await vi.advanceTimersByTimeAsync(0)
    const says = container.querySelectorAll('.answered .say')
    expect(says).toHaveLength(1)
    expect(says[0]?.closest('li')?.textContent).toContain('Gz!')
  })
})
