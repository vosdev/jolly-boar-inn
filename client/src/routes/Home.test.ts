/** The front page: a code typed the way it was shouted, the public lobbies, and the rooms created here. */

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as api from '../lib/api'
import { savePastGame } from '../lib/history'
import { rememberCreated, setSession } from '../lib/session'
import { headsDrawn } from '../test-heads'
import Home from './Home.svelte'

vi.mock('../lib/api', async (importOriginal) => {
  const real = await importOriginal<typeof import('../lib/api')>()
  return { ...real, deleteRoom: vi.fn(), getPublicRooms: vi.fn() }
})

const navigate = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  vi.mocked(api.deleteRoom).mockResolvedValue(undefined)
  vi.mocked(api.getPublicRooms).mockResolvedValue([])
})

const LOBBY: api.PublicRoom = {
  code: 'DRAGON',
  host: { id: '7da6f39a-535d-46db-9c02-801eff2c2eb1', display_name: 'Zezima', avatar: 3 },
  players: 3,
  max_players: 50,
  rounds: 2,
  modes: ['more_less', 'price_is_right'],
}

async function typeCode(typed: string): Promise<void> {
  await fireEvent.input(screen.getByLabelText('Room code'), { target: { value: typed } })
  await fireEvent.click(screen.getByRole('button', { name: 'Join' }))
}

describe('Home', () => {
  it('leaves the inn’s name to the top bar, and one tap goes to Create', async () => {
    render(Home, { navigate })
    const heading = screen.getByRole('heading', { level: 1 }).textContent ?? ''
    expect(heading.trim()).not.toBe('')
    expect(heading).not.toContain('Jolly Boar Inn')
    await fireEvent.click(screen.getByRole('button', { name: 'Create a room' }))
    expect(navigate).toHaveBeenCalledWith('/create')
  })

  it('joins a code typed as two words', async () => {
    render(Home, { navigate })
    await typeCode("Ahrim's Staff")
    expect(navigate).toHaveBeenCalledWith('/r/AHRIMSSTAFF')
  })

  it('says so when what was typed is not a code, and stays put', async () => {
    render(Home, { navigate })
    await typeCode('- -')
    expect(screen.getByText('That is not a room code.')).toBeTruthy()
    expect(navigate).not.toHaveBeenCalled()
    await fireEvent.input(screen.getByLabelText('Room code'), { target: { value: 'dragon' } })
    expect(screen.queryByText('That is not a room code.')).toBeNull()
  })

  it('links to the admin view only for a browser that holds the admin token', async () => {
    render(Home, { navigate })
    expect(screen.queryByRole('button', { name: 'Admin' })).toBeNull()
    cleanup()

    localStorage.setItem('jbi:admin', '0123456789abcdef0123456789abcdef')
    render(Home, { navigate })
    await fireEvent.click(screen.getByRole('button', { name: 'Admin' }))
    expect(navigate).toHaveBeenCalledWith('/admin')
  })

  it('lists only the rooms created here that have not expired', () => {
    localStorage.setItem(
      'jbi:created',
      JSON.stringify([
        { code: 'RUNE', expires_at: '2099-01-01T00:00:00Z' },
        { code: 'BRONZE', expires_at: '2000-01-01T00:00:00Z' },
      ]),
    )
    render(Home, { navigate })
    expect(screen.getByText('RUNE')).toBeTruthy()
    expect(screen.queryByText('BRONZE')).toBeNull()
  })

  describe('Public rooms', () => {
    it('lists each public lobby with its host, head and rounds, and joins it', async () => {
      vi.mocked(api.getPublicRooms).mockResolvedValue([LOBBY])
      render(Home, { navigate })
      const row = (await screen.findByText('DRAGON')).closest('li')!
      expect(screen.getByRole('heading', { name: 'Public rooms' })).toBeTruthy()
      expect(within(row).getByText('Zezima')).toBeTruthy()
      expect(within(row).getByText('3/50 players · 2 rounds: More or Less, The Price is Right')).toBeTruthy()
      expect(headsDrawn(row)).toEqual([{ head: 3, size: 32 }])
      await fireEvent.click(within(row).getByRole('button', { name: 'Join DRAGON' }))
      expect(navigate).toHaveBeenCalledWith('/r/DRAGON')
    })

    it('names no rounds for a room that keeps them a surprise', async () => {
      const { modes: _, ...hidden } = LOBBY
      vi.mocked(api.getPublicRooms).mockResolvedValue([{ ...hidden, rounds: 1 }])
      render(Home, { navigate })
      expect(await screen.findByText('3/50 players · 1 round')).toBeTruthy()
    })

    it('says there are none when the list is empty or unreachable', async () => {
      render(Home, { navigate })
      await waitFor(() => expect(api.getPublicRooms).toHaveBeenCalledOnce())
      expect(screen.getByRole('heading', { name: 'Public rooms' })).toBeTruthy()
      expect(screen.getByText('There are no public rooms right now.')).toBeTruthy()
      cleanup()

      vi.mocked(api.getPublicRooms).mockRejectedValue(new api.ApiFailure(0, 'unreachable', 'down'))
      render(Home, { navigate })
      await waitFor(() => expect(api.getPublicRooms).toHaveBeenCalledTimes(2))
      expect(screen.getByRole('heading', { name: 'Public rooms' })).toBeTruthy()
      expect(screen.getByText('There are no public rooms right now.')).toBeTruthy()
    })
  })

  describe('Remove', () => {
    beforeEach(() => {
      rememberCreated('RUNE', '2099-01-01T00:00:00Z')
      setSession('RUNE', 'host-session')
    })

    it('removes the room only once the host confirms', async () => {
      render(Home, { navigate })
      await fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
      expect(api.deleteRoom).not.toHaveBeenCalled()
      const dialog = screen.getByRole('dialog')
      expect(dialog.textContent).toContain(
        'Remove room RUNE? Anybody still in it is dropped, and this cannot be undone.',
      )
      await fireEvent.click(within(dialog).getByRole('button', { name: 'Remove' }))
      expect(api.deleteRoom).toHaveBeenCalledWith('RUNE', 'host-session')
      await waitFor(() => expect(screen.queryByText('RUNE')).toBeNull())
    })

    it('removes nothing when cancelled', async () => {
      render(Home, { navigate })
      await fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
      await fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }))
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(api.deleteRoom).not.toHaveBeenCalled()
      expect(screen.getByText('RUNE')).toBeTruthy()
    })
  })
})

describe('Past games', () => {
  it('lists each game with its room, when it finished and our place, and opens it', async () => {
    savePastGame({
      code: 'ABYSSAL',
      finishedAt: '2026-10-01T20:05:00Z',
      standings: [
        { player_id: 'a', display_name: 'Zezima', points: 900, rank: 1 },
        { player_id: 'b', display_name: 'Woox', points: 400, rank: 2 },
      ],
      youId: 'b',
    })
    render(Home, { navigate })
    const section = screen.getByRole('heading', { name: 'Past games' }).closest('section')!
    const row = within(section).getByText('ABYSSAL').closest('li')!
    expect(row.textContent).toContain('2nd of 2')
    expect(row.textContent).toContain('2026')
    await fireEvent.click(within(row).getByRole('button', { name: 'Open' }))
    expect(navigate).toHaveBeenCalledWith('/history/ABYSSAL/2610012005')
  })

  it('is not there before a game has finished here', () => {
    render(Home, { navigate })
    expect(screen.queryByRole('heading', { name: 'Past games' })).toBeNull()
  })
})
