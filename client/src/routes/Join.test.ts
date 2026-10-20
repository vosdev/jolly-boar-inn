/**
 * Join for a browser with no session: the room is looked up, then joined straight
 * through under the profile's name, after a prompt for one when a browser has none, and a
 * new number on the end for a name the room already has.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/svelte'
import { get } from 'svelte/store'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as api from '../lib/api'
import { ApiFailure } from '../lib/api'
import { savePastGame } from '../lib/history'
import { nameProblem } from '../lib/names'
import { profile } from '../lib/profile'
import { getSession } from '../lib/session'
import { arrival } from '../lib/stats'
import Join from './Join.svelte'

vi.mock('../lib/api', async (importOriginal) => {
  const real = await importOriginal<typeof import('../lib/api')>()
  return {
    ...real,
    getRoom: vi.fn(),
    joinRoom: vi.fn(),
    askToJoin: vi.fn(),
    pollRequest: vi.fn(),
    cancelRequest: vi.fn(),
  }
})

const navigate = vi.fn()
const CREDENTIALS: api.Credentials = {
  session: 'token',
  player: {
    id: 'a',
    display_name: 'Zezima',
    role: 'player',
    connected: true,
    avatar: null,
    ready: false,
    editing: false,
  },
}
const taken = () => new ApiFailure(409, 'name_taken', 'that name is taken')

const joinedAs = () => vi.mocked(api.joinRoom).mock.calls.map(([, name]) => name)
/** What a browser on a desktop, with no theme picked, sends the first time. */
const FIRST_ARRIVAL = { device: 'desktop', via: 'link' }

const reportFetch = vi.fn<typeof fetch>()
/** Every join failure reported to the counters, in order. */
const reported = () =>
  reportFetch.mock.calls.map(([, init]) => JSON.parse(String(init?.body)).reason as string)

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  profile.set({ name: 'Zezima', pet: 'aggy' })
  vi.mocked(api.getRoom).mockResolvedValue({ status: 'lobby', players: 2 })
  vi.mocked(api.joinRoom).mockResolvedValue(CREDENTIALS)
  history.replaceState(null, '', '/r/ABYSSAL')
  reportFetch.mockResolvedValue(new Response(null, { status: 204 }))
  vi.stubGlobal('fetch', reportFetch)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Join', () => {
  it('says which room it is, since the top bar does not', async () => {
    render(Join, { code: 'ABYSSAL', navigate })
    const heading = screen.getByRole('heading', { level: 1 })
    expect(heading.textContent).toBe('Room ABYSSAL')
    expect(heading.closest('.panel')?.textContent).toContain('Looking for the room…')
    await waitFor(() => expect(navigate).toHaveBeenCalled())
  })

  it('joins straight through under the profile, and lands in the room', async () => {
    render(Join, { code: 'ABYSSAL', navigate })
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/r/ABYSSAL'))
    expect(api.joinRoom).toHaveBeenCalledTimes(1)
    expect(api.joinRoom).toHaveBeenCalledWith(
      'ABYSSAL',
      'Zezima',
      'aggy',
      false,
      null,
      FIRST_ARRIVAL,
    )
    expect(getSession('ABYSSAL')).toBe('token')
  })

  it('asks a browser with no profile for a name first, and joins nothing until it has one', async () => {
    profile.set(null)
    render(Join, { code: 'ABYSSAL', navigate })
    const field = (await screen.findByRole('textbox')) as HTMLInputElement
    expect(field.closest('dialog')?.open).toBe(true)
    expect(nameProblem(field.value)).toBeNull()
    expect(screen.queryByText(/^Joining as/)).toBeNull()
    expect(api.joinRoom).not.toHaveBeenCalled()
    expect(get(profile)).toBeNull()
  })

  it('cannot be dismissed with Escape', async () => {
    profile.set(null)
    render(Join, { code: 'ABYSSAL', navigate })
    const dialog = (await screen.findByRole('textbox')).closest('dialog')!
    const cancel = new Event('cancel', { cancelable: true })
    dialog.dispatchEvent(cancel)
    expect(cancel.defaultPrevented).toBe(true)
    expect(document.querySelector('dialog')?.open).toBe(true)
  })

  it('joins as the name and pet confirmed, and keeps them as the profile', async () => {
    profile.set(null)
    render(Join, { code: 'ABYSSAL', navigate })
    const field = (await screen.findByRole('textbox')) as HTMLInputElement
    await fireEvent.input(field, { target: { value: 'Zezima' } })
    await fireEvent.click(screen.getByRole('button', { name: 'Join' }))
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/r/ABYSSAL'))
    const made = get(profile)
    expect(made?.name).toBe('Zezima')
    expect(vi.mocked(api.joinRoom).mock.calls[0]).toEqual([
      'ABYSSAL',
      'Zezima',
      made?.pet,
      false,
      null,
      FIRST_ARRIVAL,
    ])
    expect(document.querySelector('dialog')).toBeNull()
  })

  it('joins as the generated name when it is confirmed untouched', async () => {
    profile.set(null)
    render(Join, { code: 'ABYSSAL', navigate })
    const field = (await screen.findByRole('textbox')) as HTMLInputElement
    const offered = field.value
    await fireEvent.click(screen.getByRole('button', { name: 'Join' }))
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/r/ABYSSAL'))
    expect(joinedAs()).toEqual([offered])
    expect(get(profile)?.name).toBe(offered)
  })

  it('does not ask for a name when the game has already started', async () => {
    profile.set(null)
    vi.mocked(api.getRoom).mockResolvedValue({ status: 'playing', players: 4 })
    render(Join, { code: 'ABYSSAL', navigate })
    expect(await screen.findByText('This game has already started.')).toBeTruthy()
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

  it.each(['key_required', 'bad_key'])(
    'offers to ask the host, rather than erroring or asking for a link, on %s',
    async (code) => {
      vi.mocked(api.joinRoom).mockRejectedValueOnce(refused(code))
      render(Join, { code: 'ABYSSAL', navigate })
      await screen.findByRole('button', { name: 'Ask the host to let you in' })
      expect(screen.getByText('This room is invite-only.')).toBeTruthy()
      expect(screen.queryByRole('textbox')).toBeNull()
      expect(screen.queryByText('refused')).toBeNull()
      expect(document.querySelector('.error')).toBeNull()
    },
  )
})

describe('Asking the host to let you in', () => {
  const askButton = () => screen.findByRole('button', { name: 'Ask the host to let you in' })

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.mocked(api.joinRoom).mockRejectedValue(new ApiFailure(403, 'key_required', 'refused'))
    vi.mocked(api.askToJoin).mockResolvedValue({ ticket: 'ticket' })
    vi.mocked(api.cancelRequest).mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  async function asked(): Promise<void> {
    render(Join, { code: 'ABYSSAL', navigate })
    await fireEvent.click(await askButton())
    await screen.findByText('Waiting for the host to let you in as Zezima…')
  }

  it('waits for the host beside the link prompt, then lands in the room once let in', async () => {
    vi.mocked(api.pollRequest)
      .mockResolvedValueOnce({ status: 'waiting' })
      .mockResolvedValueOnce({ status: 'accepted', ...CREDENTIALS })
    await asked()
    expect(api.askToJoin).toHaveBeenCalledWith('ABYSSAL', 'Zezima', 'aggy', false, FIRST_ARRIVAL)
    await vi.advanceTimersByTimeAsync(2000)
    expect(api.pollRequest).toHaveBeenCalledWith('ABYSSAL', 'ticket')
    expect(navigate).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(2000)
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/r/ABYSSAL'))
    expect(getSession('ABYSSAL')).toBe('token')
    expect(api.cancelRequest).not.toHaveBeenCalled()
  })

  it('turns the number over when the name is taken, and says which it asked as', async () => {
    vi.mocked(api.askToJoin)
      .mockRejectedValueOnce(taken())
      .mockResolvedValueOnce({ ticket: 'ticket' })
    vi.mocked(api.pollRequest).mockResolvedValue({ status: 'waiting' })
    render(Join, { code: 'ABYSSAL', navigate })
    await fireEvent.click(await askButton())
    const names = vi.mocked(api.askToJoin).mock.calls.map(([, name]) => name)
    expect(names[0]).toBe('Zezima')
    await screen.findByText(`Waiting for the host to let you in as ${names[1]}…`)
  })

  it.each([
    ['request_denied', 403, "The host didn't let you in."],
    ['request_gone', 410, 'Nobody answered in time. You can ask again.'],
  ])('says so on %s, and offers to ask again', async (code, status, text) => {
    vi.mocked(api.pollRequest).mockRejectedValueOnce(new ApiFailure(status, code, 'no'))
    await asked()
    await vi.advanceTimersByTimeAsync(2000)
    await screen.findByText(text)
    expect(await askButton()).toBeTruthy()
    expect(navigate).not.toHaveBeenCalled()
  })

  it('keeps polling through a dropped connection', async () => {
    vi.mocked(api.pollRequest)
      .mockRejectedValueOnce(new ApiFailure(0, 'unreachable', 'offline'))
      .mockResolvedValueOnce({ status: 'accepted', ...CREDENTIALS })
    await asked()
    await vi.advanceTimersByTimeAsync(4000)
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/r/ABYSSAL'))
  })

  it('says a full queue in its own words', async () => {
    vi.mocked(api.askToJoin).mockRejectedValueOnce(new ApiFailure(409, 'requests_full', 'full'))
    render(Join, { code: 'ABYSSAL', navigate })
    await fireEvent.click(await askButton())
    await screen.findByText('Too many people are waiting to be let in. Try again in a minute.')
  })

  it('withdraws the request on Cancel, and stops polling', async () => {
    vi.mocked(api.pollRequest).mockResolvedValue({ status: 'waiting' })
    await asked()
    await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(api.cancelRequest).toHaveBeenCalledWith('ABYSSAL', 'ticket')
    await vi.advanceTimersByTimeAsync(4000)
    expect(api.pollRequest).not.toHaveBeenCalled()
    expect(await askButton()).toBeTruthy()
  })

  it('withdraws the request when the page goes away', async () => {
    vi.mocked(api.pollRequest).mockResolvedValue({ status: 'waiting' })
    const { unmount } = render(Join, { code: 'ABYSSAL', navigate })
    await fireEvent.click(await askButton())
    await screen.findByText('Waiting for the host to let you in as Zezima…')
    unmount()
    expect(api.cancelRequest).toHaveBeenCalledWith('ABYSSAL', 'ticket')
  })
})

describe('Join for a room that is gone', () => {
  const kept = () =>
    savePastGame({
      code: 'ABYSSAL',
      finishedAt: '2026-10-01T20:05:00Z',
      standings: [
        {
          player_id: 'a',
          display_name: 'Zezima',
          points: 900,
          rank: 1,
          points_gained: 900,
          previous_rank: null,
          avatar: null,
        },
      ],
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

describe('What a join tells the counters', () => {
  const arrivalSent = () => vi.mocked(api.joinRoom).mock.calls[0]![5]

  it.each([
    [{ via: 'code' }, '/r/ABYSSAL', 'code'],
    [{ via: 'public' }, '/r/ABYSSAL', 'public'],
    [null, '/r/ABYSSAL', 'link'],
    [{ via: 'code' }, '/r/ABYSSAL#k=abc', 'invite'],
  ])('says it came by %o to %s as %s', async (state, path, via) => {
    history.replaceState(state, '', path)
    render(Join, { code: 'ABYSSAL', navigate })
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/r/ABYSSAL'))
    expect(arrivalSent()?.via).toBe(via)
  })

  it('sends a picked theme and the device once per browser, after a join that counted them', async () => {
    localStorage.setItem('jbi:theme', 'tzhaar')
    vi.mocked(api.joinRoom).mockRejectedValueOnce(new ApiFailure(409, 'room_full', 'full'))
    const first = render(Join, { code: 'ABYSSAL', navigate })
    await screen.findByText('full')
    first.unmount()
    render(Join, { code: 'ABYSSAL', navigate })
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/r/ABYSSAL'))
    const sent = vi.mocked(api.joinRoom).mock.calls.map((call) => call[5])
    expect(sent).toEqual([
      { theme: 'tzhaar', device: 'desktop', via: 'link' },
      { theme: 'tzhaar', device: 'desktop', via: 'link' },
    ])
    expect(arrival('link')).toEqual({ via: 'link' })
    localStorage.setItem('jbi:theme', 'jolly')
    expect(arrival('link')).toEqual({ theme: 'jolly', via: 'link' })
  })

  it('reports a code nobody has, but not one it kept a past game for', async () => {
    vi.mocked(api.getRoom).mockRejectedValue(new ApiFailure(404, 'not_found', 'no room'))
    const first = render(Join, { code: 'ABYSSAL', navigate })
    await screen.findByText('There is no room ABYSSAL.')
    expect(reported()).toEqual(['not_found'])
    first.unmount()
    savePastGame({
      code: 'ABYSSAL',
      finishedAt: '2026-10-01T20:05:00Z',
      standings: [
        {
          player_id: 'a',
          display_name: 'Zezima',
          points: 900,
          rank: 1,
          points_gained: 900,
          previous_rank: null,
          avatar: null,
        },
      ],
      youId: 'a',
    })
    render(Join, { code: 'ABYSSAL', navigate })
    await waitFor(() => expect(navigate).toHaveBeenCalled())
    expect(reported()).toEqual(['not_found'])
  })

  it('reports a game that already started', async () => {
    vi.mocked(api.getRoom).mockResolvedValue({ status: 'playing', players: 4 })
    render(Join, { code: 'ABYSSAL', navigate })
    await screen.findByText('This game has already started.')
    expect(reported()).toEqual(['not_joinable'])
  })

  it('reports a taken name once, when it gives up turning the number over', async () => {
    vi.mocked(api.joinRoom).mockRejectedValue(taken())
    render(Join, { code: 'ABYSSAL', navigate })
    await screen.findByText('that name is taken')
    expect(joinedAs()).toHaveLength(4)
    expect(reported()).toEqual(['name_taken'])
  })

  it('reports nothing for a name it got past', async () => {
    vi.mocked(api.joinRoom).mockRejectedValueOnce(taken()).mockResolvedValueOnce(CREDENTIALS)
    render(Join, { code: 'ABYSSAL', navigate })
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/r/ABYSSAL'))
    expect(reported()).toEqual([])
  })

  it.each([
    ['room_full', 409, ['room_full']],
    ['not_open', 409, ['not_joinable']],
    ['bad_key', 403, ['bad_key']],
    ['key_required', 403, []],
  ])('reports a join refused with %s as what the player saw', async (code, status, expected) => {
    vi.mocked(api.joinRoom).mockRejectedValue(new ApiFailure(status, code, 'refused'))
    render(Join, { code: 'ABYSSAL', navigate })
    await screen.findByRole(code.includes('key') ? 'button' : 'textbox')
    expect(reported()).toEqual(expected)
  })
})

describe('What a join request tells the counters', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.mocked(api.joinRoom).mockRejectedValue(new ApiFailure(403, 'key_required', 'refused'))
    vi.mocked(api.askToJoin).mockResolvedValue({ ticket: 'ticket' })
    vi.mocked(api.cancelRequest).mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  async function askThenHear(answer: () => Promise<api.RequestStatus>): Promise<void> {
    vi.mocked(api.pollRequest).mockImplementationOnce(answer)
    render(Join, { code: 'ABYSSAL', navigate })
    await fireEvent.click(await screen.findByRole('button', { name: 'Ask the host to let you in' }))
    await screen.findByText('Waiting for the host to let you in as Zezima…')
    await vi.advanceTimersByTimeAsync(2000)
  }

  it('remembers the device as counted once the host lets them in', async () => {
    await askThenHear(async () => ({ status: 'accepted', ...CREDENTIALS }))
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/r/ABYSSAL'))
    expect(arrival()).toEqual({})
  })

  it('reports a host saying no, and still counts the device as unsent', async () => {
    await askThenHear(async () => {
      throw new ApiFailure(403, 'request_denied', 'no')
    })
    await screen.findByText("The host didn't let you in.")
    expect(reported()).toEqual(['request_denied'])
    expect(arrival()).toEqual({ device: 'desktop' })
  })

  it('reports a full queue', async () => {
    vi.mocked(api.askToJoin).mockRejectedValueOnce(new ApiFailure(409, 'requests_full', 'full'))
    render(Join, { code: 'ABYSSAL', navigate })
    await fireEvent.click(await screen.findByRole('button', { name: 'Ask the host to let you in' }))
    await screen.findByText('Too many people are waiting to be let in. Try again in a minute.')
    expect(reported()).toEqual(['requests_full'])
  })
})
