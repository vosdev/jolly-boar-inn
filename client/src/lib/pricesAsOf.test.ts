/** The price modes' dates: fetched once from `/api/modes`, kept only for modes that have one. */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const MODES = [
  { id: 'more_less', types: ['more_less'], questions: null, seconds: null, as_of: '2026-09-01' },
  { id: 'price_is_right', types: [], questions: null, seconds: null, as_of: '2026-10-08' },
  { id: 'bestiary', types: [], questions: null, seconds: null, as_of: null },
]

let get: ReturnType<typeof vi.fn<typeof fetch>>

beforeEach(() => {
  vi.resetModules()
  get = vi.fn<typeof fetch>().mockResolvedValue(Response.json(MODES))
  vi.stubGlobal('fetch', get)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('pricesAsOf', () => {
  it('keeps the date of every mode that has one, and fetches only once', async () => {
    const { loadPricesAsOf, pricesAsOf } = await import('./pricesAsOf.svelte')
    await Promise.all([loadPricesAsOf(), loadPricesAsOf()])
    expect(pricesAsOf.byMode).toEqual({ more_less: '2026-09-01', price_is_right: '2026-10-08' })
    expect(get).toHaveBeenCalledTimes(1)
  })

  it('tries again on the next call after a failed fetch', async () => {
    get.mockRejectedValueOnce(new TypeError('offline'))
    const { loadPricesAsOf, pricesAsOf } = await import('./pricesAsOf.svelte')
    await loadPricesAsOf()
    expect(pricesAsOf.byMode).toEqual({})
    await loadPricesAsOf()
    expect(pricesAsOf.byMode.price_is_right).toBe('2026-10-08')
  })

  it('gives the footer the newest date, or none', async () => {
    const { newestAsOf } = await import('./pricesAsOf.svelte')
    expect(newestAsOf({ a: '2026-10-08', b: '2026-09-01' })).toBe('2026-10-08')
    expect(newestAsOf({})).toBeNull()
  })
})
