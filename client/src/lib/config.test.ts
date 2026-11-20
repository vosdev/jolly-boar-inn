import { afterEach, describe, expect, it, vi } from 'vitest'

import * as api from './api'
import { clearConfigCache, roomHours } from './config'

vi.mock('./api', async (importOriginal) => {
  const real = await importOriginal<typeof import('./api')>()
  return { ...real, getConfig: vi.fn() }
})

afterEach(() => {
  vi.clearAllMocks()
  clearConfigCache()
})

describe('roomHours', () => {
  it('asks the server once for every caller on the page', async () => {
    vi.mocked(api.getConfig).mockResolvedValue({ room_ttl_hours: 48 })
    expect(await Promise.all([roomHours(), roomHours()])).toEqual([48, 48])
    expect(api.getConfig).toHaveBeenCalledTimes(1)
  })

  it('is null on a failure, and asks again next time', async () => {
    vi.mocked(api.getConfig).mockRejectedValueOnce(new api.ApiFailure(503, 'unavailable', 'down'))
    expect(await roomHours()).toBeNull()
    vi.mocked(api.getConfig).mockResolvedValue({ room_ttl_hours: 72 })
    expect(await roomHours()).toBe(72)
  })
})
