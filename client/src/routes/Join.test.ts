/**
 * Join for a browser with no session: the room is looked up, then joined straight
 * through under the profile's name, a fresh one for a browser with none, and a new
 * number on the end for a name the room already has.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/svelte'
import { get } from 'svelte/store'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as api from '../lib/api'
import { ApiFailure } from '../lib/api'
import { savePastGame } from '../lib/history'
import { nudge, profile } from '../lib/profile'
import { getSession } from '../lib/session'
import Join from './Join.svelte'

vi.mock('../lib/api', async (importOriginal) => {
  const real = await importOriginal<typeof import('../lib/api')>()
  return { ...real, getRoom: vi.fn(), joinRoom: vi.fn() }
})

const navigate = vi.fn()
const CREDENTIALS: api.Credentials = {
  session: 'token',
  player: { id: 'a', display_name: 'Zezima', role: 'player', connected: true },
}
const taken = () => new ApiFailure(409, 'name_taken', 'that name is taken')

const joinedAs = () => vi.mocked(api.joinRoom).mock.calls.map(([, name]) => name)

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  profile.set({ name: 'Zezima', head: 3 })
  nudge.set(null)
  vi.mocked(api.getRoom).mockResolvedValue({ status: 'lobby', players: 2 })
  vi.mocked(api.joinRoom).mockResolvedValue(CREDENTIALS)
  history.replaceState(null, '', '/r/ABYSSAL')
})

describe('Join', () => {
  it('says which room it is, since the top bar does not', async () => {
    render(Join, { code: 'ABYSSAL', navigate })
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Room ABYSSAL')
    await waitFor(() => expect(navigate).toHaveBeenCalled())
  })

  it('joins straight through under the profile, and lands in the room', async () => {
    render(Join, { code: 'ABYSSAL', navigate })
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/r/ABYSSAL'))
    expect(api.joinRoom).toHaveBeenCalledTimes(1)
    expect(api.joinRoom).toHaveBeenCalledWith('ABYSSAL', 'Zezima', 3, false, null)
    expect(getSession('ABYSSAL')).toBe('token')
    expect(get(nudge)).toBeNull()
  })

  it('gives a browser with no profile one, joins as it, and nudges about it', async () => {
    profile.set(null)
    render(Join, { code: 'ABYSSAL', navigate })
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/r/ABYSSAL'))
    const made = get(profile)
    expect(made).not.toBeNull()
    expect(joinedAs()).toEqual([made?.name])
    // The profile was made just before the join, so this is still a first visit.
    expect(vi.mocked(api.joinRoom).mock.calls[0]![3]).toBe(false)
    expect(get(nudge)).toBe('ABYSSAL')
    expect(document.querySelector('dialog')).toBeNull()
  })

  it('turns the number over on name_taken, with a new name each time, and keeps the profile', async () => {
    vi.mocked(api.joinRoom)
      .mockRejectedValueOnce(taken())
      .mockRejectedValueOnce(taken())
      .mockResolvedValueOnce(CREDENTIALS)
    render(Join, { code: 'ABYSSAL', navigate })
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/r/ABYSSAL'))
    const names = joinedAs()
    expect(names).toHaveLength(3)
    expect(names[0]).toBe('Zezima')
    expect(new Set(names).size).toBe(3)
    expect(get(profile)?.name).toBe('Zezima')
  })

  it('stops turning it over after three tries, and offers the form with the last name', async () => {
    vi.mocked(api.joinRoom).mockRejectedValue(taken())
    render(Join, { code: 'ABYSSAL', navigate })
    const field = (await screen.findByRole('textbox')) as HTMLInputElement
    expect(joinedAs()).toHaveLength(4)
    expect(field.value).toBe(joinedAs()[3])
    expect(screen.getByText('that name is taken')).toBeTruthy()
    expect(navigate).not.toHaveBeenCalled()
  })

  it('falls back to the form, filled in, when the room refuses for another reason', async () => {
    vi.mocked(api.joinRoom).mockRejectedValue(new ApiFailure(409, 'room_full', 'the room is full'))
    render(Join, { code: 'ABYSSAL', navigate })
    const field = (await screen.findByRole('textbox')) as HTMLInputElement
    expect(field.value).toBe('Zezima')
    expect(screen.getByText('the room is full')).toBeTruthy()
    expect(api.joinRoom).toHaveBeenCalledTimes(1)
    expect(screen.getAllByRole('textbox')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Roll a random name' })).toBeTruthy()
  })

  it('says so for a room that does not exist, and joins nothing', async () => {
    vi.mocked(api.getRoom).mockRejectedValue(new ApiFailure(404, 'not_found', 'no such room'))
    render(Join, { code: 'ABYSSAL', navigate })
    expect(await screen.findByText('There is no room ABYSSAL.')).toBeTruthy()
    expect(api.joinRoom).not.toHaveBeenCalled()
  })

  it('does not join a game that has already started', async () => {
    vi.mocked(api.getRoom).mockResolvedValue({ status: 'playing', players: 4 })
    render(Join, { code: 'ABYSSAL', navigate })
    expect(await screen.findByText('This game has already started.')).toBeTruthy()
    expect(api.joinRoom).not.toHaveBeenCalled()
  })
})

describe('Join for an invite-only room', () => {
  const refused = (code: string) => new ApiFailure(403, code, 'refused')
  const keysSent = () => vi.mocked(api.joinRoom).mock.calls.map((call) => call[4])
  const field = () => screen.findByRole('textbox', { name: 'Invite link' })

  it('joins with the key from the link, and takes it out of the address bar', async () => {
    history.replaceState(null, '', '/r/ABYSSAL#k=abc_DEF-123')
    render(Join, { code: 'ABYSSAL', navigate })
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/r/ABYSSAL'))
    expect(keysSent()).toEqual(['abc_DEF-123'])
    expect(location.hash).toBe('')
    expect(location.pathname).toBe('/r/ABYSSAL')
  })

  it('keeps the key while it turns the number over', async () => {
    history.replaceState(null, '', '/r/ABYSSAL#k=abc')
    vi.mocked(api.joinRoom).mockRejectedValueOnce(taken()).mockResolvedValueOnce(CREDENTIALS)
    render(Join, { code: 'ABYSSAL', navigate })
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/r/ABYSSAL'))
    expect(keysSent()).toEqual(['abc', 'abc'])
  })

  it('asks for the link, rather than erroring, when the room wants a key', async () => {
    vi.mocked(api.joinRoom).mockRejectedValueOnce(refused('key_required'))
    render(Join, { code: 'ABYSSAL', navigate })
    await field()
    expect(screen.getByText('This room is invite-only. Paste the link the host shared.')).toBeTruthy()
    expect(screen.queryByText('refused')).toBeNull()
    expect(document.querySelector('.error')).toBeNull()
    expect(screen.queryByRole('textbox', { name: /name/i })).toBeNull()
  })

  it('says a wrong key is out of date, and asks again', async () => {
    history.replaceState(null, '', '/r/ABYSSAL#k=stale')
    vi.mocked(api.joinRoom).mockRejectedValueOnce(refused('bad_key'))
    render(Join, { code: 'ABYSSAL', navigate })
    await field()
    expect(screen.getByText('That link is out of date or mistyped.')).toBeTruthy()
  })

  it.each([
    ['the whole link', 'https://inn.example/r/ABYSSAL#k=fresh'],
    ['the key alone', '  fresh '],
  ])('joins with %s pasted, under the name it was trying', async (_, text) => {
    vi.mocked(api.joinRoom).mockRejectedValueOnce(refused('key_required'))
    render(Join, { code: 'ABYSSAL', navigate })
    await fireEvent.input(await field(), { target: { value: text } })
    await fireEvent.click(screen.getByRole('button', { name: 'Join' }))
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/r/ABYSSAL'))
    expect(keysSent()).toEqual([null, 'fresh'])
    expect(joinedAs()).toEqual(['Zezima', 'Zezima'])
  })

  it('will not send what is no key at all', async () => {
    vi.mocked(api.joinRoom).mockRejectedValueOnce(refused('key_required'))
    render(Join, { code: 'ABYSSAL', navigate })
    await fireEvent.input(await field(), { target: { value: 'https://inn.example/r/ABYSSAL' } })
    expect((screen.getByRole('button', { name: 'Join' }) as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('Join for a room that is gone', () => {
  const kept = () =>
    savePastGame({
      code: 'ABYSSAL',
      finishedAt: '2026-10-01T20:05:00Z',
      standings: [{ player_id: 'a', display_name: 'Zezima', points: 900, rank: 1 }],
      youId: 'a',
    })

  it.each([
    [404, 'not_found'],
    [410, 'expired'],
  ])('opens the result this browser kept on a %i', async (status, code) => {
    kept()
    vi.mocked(api.getRoom).mockRejectedValue(new ApiFailure(status, code, 'gone'))
    render(Join, { code: 'ABYSSAL', navigate })
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/history/ABYSSAL/2610012005'))
    expect(api.joinRoom).not.toHaveBeenCalled()
  })

  it('says there is no room, when it kept none', async () => {
    vi.mocked(api.getRoom).mockRejectedValue(new ApiFailure(404, 'not_found', 'no room'))
    render(Join, { code: 'ABYSSAL', navigate })
    await screen.findByText('There is no room ABYSSAL.')
    expect(navigate).not.toHaveBeenCalled()
  })
})
