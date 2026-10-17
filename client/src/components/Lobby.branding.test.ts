/**
 * The lobby under the owner's branding: Home's hero on the stage, the theme's own where
 * there is one. `Lobby.test.ts` has the stock inn, where the Wise Old Man hosts.
 */

import { render, waitFor } from '@testing-library/svelte'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { RoomView } from '../lib/protocol'
import { applyServerMessage, resetRoom } from '../lib/stores'
import type { RoomSocket } from '../lib/ws'
import Lobby from './Lobby.svelte'

vi.mock('virtual:branding', () => ({
  siteName: 'The Jolly Boar Inn',
  initial: 'J',
  logo: '/assets/logo-abc123.svg',
  logos: {},
  favicons: {},
  hero: '/assets/hero-abc123.svg',
  heroes: { tzhaar: '/assets/hero-tzhaar-def456.svg' },
  defaultTheme: '',
}))

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
  estimated_seconds: 0,
  segment: null,
  finished_at: null,
}

const stageArt = () =>
  [...document.querySelectorAll('.stage .npc img')].map((img) => img.getAttribute('src'))

beforeEach(() => {
  document.documentElement.dataset.theme = 'jolly'
  resetRoom()
  const you = { id: 'a', display_name: 'Zezima', role: 'admin' as const, connected: true }
  applyServerMessage({
    t: 'welcome',
    room: ROOM,
    you,
    players: [you],
    question: null,
    your_answer: null,
    standings: [],
    server_time: new Date().toISOString(),
    server_version: __APP_VERSION__,
  })
})

describe('Lobby, with a hero', () => {
  it('stands Home’s hero on the stage, swapping in the theme’s own', async () => {
    render(Lobby, { socket: { send: () => true } as unknown as RoomSocket })
    expect(stageArt()).toEqual(['/assets/hero-abc123.svg'])
    document.documentElement.dataset.theme = 'tzhaar'
    await waitFor(() => expect(stageArt()).toEqual(['/assets/hero-tzhaar-def456.svg']))
    document.documentElement.dataset.theme = 'wilderness'
    await waitFor(() => expect(stageArt()).toEqual(['/assets/hero-abc123.svg']))
  })
})
