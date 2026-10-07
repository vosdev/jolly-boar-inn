/** What a browser tells the daily counters, and how often. */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiFailure } from './api'
import { arrival, counted, device, failureOf, reportFailure, routeOf } from './stats'

function storageThrows(): void {
  const denied = (): never => {
    throw new DOMException('The operation is insecure.', 'SecurityError')
  }
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(denied)
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(denied)
}

beforeEach(() => localStorage.clear())
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('device', () => {
  it('is mobile for a coarse pointer, tablets included, and desktop otherwise', () => {
    const coarse = vi.spyOn(window, 'matchMedia')
    coarse.mockReturnValueOnce({ matches: true } as MediaQueryList)
    expect(device()).toBe('mobile')
    expect(coarse).toHaveBeenCalledWith('(pointer: coarse)')
    expect(device()).toBe('desktop')
  })
})

describe('arrival', () => {
  it('leaves out a theme nobody picked', () => {
    expect(arrival()).toEqual({ device: 'desktop' })
  })

  it('sends a picked theme and the device until they are counted, then only on a change', () => {
    localStorage.setItem('jbi:theme', 'party_room')
    const first = arrival('code')
    expect(first).toEqual({ theme: 'party_room', device: 'desktop', via: 'code' })
    expect(arrival('code')).toEqual(first)
    counted(first)
    expect(arrival('code')).toEqual({ via: 'code' })
    localStorage.setItem('jbi:theme', 'jolly')
    expect(arrival()).toEqual({ theme: 'jolly' })
  })

  it('sends a theme this build does not paint as no theme', () => {
    localStorage.setItem('jbi:theme', 'varrock')
    expect(arrival()).toEqual({ device: 'desktop' })
  })

  it('reports every time when storage throws, rather than failing the join', () => {
    storageThrows()
    const sent = arrival('link')
    expect(sent).toEqual({ device: 'desktop', via: 'link' })
    counted(sent)
    expect(arrival('link')).toEqual(sent)
  })
})

describe('routeOf', () => {
  it.each([
    ['abc', { via: 'code' }, 'invite'],
    [null, { via: 'code' }, 'code'],
    [null, { via: 'public' }, 'public'],
    [null, { via: 'invite' }, 'link'],
    [null, null, 'link'],
    [null, 'code', 'link'],
  ])('with key %s and state %o is %s', (key, state, route) => {
    expect(routeOf(key, state)).toBe(route)
  })
})

describe('failureOf', () => {
  it.each([
    ['not_found', 'not_found'],
    ['name_taken', 'name_taken'],
    ['room_full', 'room_full'],
    ['not_open', 'not_joinable'],
    ['bad_key', 'bad_key'],
    ['requests_full', 'requests_full'],
    ['request_denied', 'request_denied'],
    ['key_required', null],
    ['request_gone', null],
    ['unreachable', null],
  ])('counts %s as %s', (code, reason) => {
    expect(failureOf(new ApiFailure(409, code, 'no'))).toBe(reason)
  })

  it('counts nothing that is not a refusal from the server', () => {
    expect(failureOf(new Error('boom'))).toBeNull()
  })
})

describe('reportFailure', () => {
  it('posts the reason alone, and swallows a failed post', async () => {
    const post = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('offline'))
    vi.stubGlobal('fetch', post)
    reportFailure('room_full')
    reportFailure(null)
    expect(post).toHaveBeenCalledTimes(1)
    const [path, init] = post.mock.calls[0]!
    expect(path).toBe('/api/stats/join-failure')
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body))).toEqual({ reason: 'room_full' })
    await Promise.resolve()
  })
})
