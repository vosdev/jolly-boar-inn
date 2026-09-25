/** The front page: a code typed the way it was shouted, and the rooms created here. */

import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as api from '../lib/api'
import { rememberCreated, setSession } from '../lib/session'
import Home from './Home.svelte'

vi.mock('../lib/api', async (importOriginal) => {
  const real = await importOriginal<typeof import('../lib/api')>()
  return { ...real, deleteRoom: vi.fn() }
})

const navigate = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  vi.mocked(api.deleteRoom).mockResolvedValue(undefined)
})

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
