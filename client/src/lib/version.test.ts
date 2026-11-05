/** A tab built from another version reloads once for the server it finds, never in a loop. */

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { getModes } from './api'
import { reloadForMissingChunk, reloadIfNewer, reloadIfStale, resetNewerVersion } from './version'

beforeEach(() => {
  sessionStorage.clear()
  resetNewerVersion()
  vi.unstubAllGlobals()
})

function serverAt(version: string | null): void {
  const headers: Record<string, string> = version === null ? {} : { 'x-app-version': version }
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('[]', { headers })),
  )
}

describe('reloadIfStale', () => {
  it('leaves a tab built from the server version alone', () => {
    const reload = vi.fn()
    expect(reloadIfStale(__APP_VERSION__, reload)).toBe(false)
    expect(reload).not.toHaveBeenCalled()
  })

  it('reloads once per server version', () => {
    const reload = vi.fn()
    expect(reloadIfStale('99.0.0', reload)).toBe(true)
    // The reloaded page still being the old build (a stale cache) must not loop.
    expect(reloadIfStale('99.0.0', reload)).toBe(false)
    expect(reload).toHaveBeenCalledTimes(1)
    // The next deploy is a new version, and gets its own reload.
    expect(reloadIfStale('99.0.1', reload)).toBe(true)
    expect(reload).toHaveBeenCalledTimes(2)
  })

  it('does not reload when it cannot remember having done so', () => {
    const reload = vi.fn()
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage denied')
    })
    try {
      expect(reloadIfStale('99.0.0', reload)).toBe(false)
    } finally {
      getItem.mockRestore()
    }
    expect(reload).not.toHaveBeenCalled()
  })
})

describe('reloadIfNewer', () => {
  it('reloads once after an API response from another version', async () => {
    serverAt('99.0.0')
    await getModes()
    const reload = vi.fn()
    expect(reloadIfNewer(reload)).toBe(true)
    expect(reloadIfNewer(reload)).toBe(false)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('leaves the tab alone when the API names this version or none', async () => {
    const reload = vi.fn()
    for (const version of [__APP_VERSION__, null]) {
      serverAt(version)
      await getModes()
      expect(reloadIfNewer(reload)).toBe(false)
    }
    expect(reload).not.toHaveBeenCalled()
  })
})

describe('reloadForMissingChunk', () => {
  it('reloads once per build, whatever a version reload remembered', () => {
    const reload = vi.fn()
    expect(reloadIfStale('99.0.0', reload)).toBe(true)
    expect(reloadForMissingChunk(reload)).toBe(true)
    expect(reloadForMissingChunk(reload)).toBe(false)
    expect(reloadIfStale('99.0.0', reload)).toBe(false)
    expect(reload).toHaveBeenCalledTimes(2)
  })
})
