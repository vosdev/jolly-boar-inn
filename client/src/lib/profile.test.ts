/**
 * The profile under `jbi:profile`, and a browser whose storage throws: it gets no profile
 * on each visit, and the one it makes lasts for the page.
 */

import { get } from 'svelte/store'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { isPet } from './pets'

/** The module as a fresh page load would evaluate it. */
async function visit(): Promise<typeof import('./profile')> {
  vi.resetModules()
  return import('./profile')
}

function storageThrows(): void {
  const denied = (): never => {
    throw new DOMException('The operation is insecure.', 'SecurityError')
  }
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(denied)
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(denied)
}

beforeEach(() => localStorage.clear())
afterEach(() => vi.restoreAllMocks())

describe('profile', () => {
  it('is kept under jbi:profile and read back on the next visit', async () => {
    const first = await visit()
    expect(get(first.profile)).toBeNull()
    first.saveProfile('  Zezima ', 'aggy')
    expect(JSON.parse(localStorage.getItem('jbi:profile')!)).toEqual({
      name: 'Zezima',
      pet: 'aggy',
    })
    expect(get((await visit()).profile)).toEqual({ name: 'Zezima', pet: 'aggy' })
  })

  it.each([{ name: 'Zezima' }, { name: 'Zezima', head: 4 }, { name: 'Zezima', pet: 'not_a_pet' }])(
    'gives a stored profile with no pet this build offers one, and keeps that one',
    async (stored) => {
      localStorage.setItem('jbi:profile', JSON.stringify(stored))
      const pet = get((await visit()).profile)?.pet
      expect(isPet(pet)).toBe(true)
      expect(get((await visit()).profile)).toEqual({ name: 'Zezima', pet })
    },
  )

  it('with storage throwing, starts empty on every visit and keeps a name for the page', async () => {
    storageThrows()
    const first = await visit()
    expect(get(first.profile)).toBeNull()
    first.saveProfile('Zezima')
    expect(get(first.profile)?.name).toBe('Zezima')
    expect(get((await visit()).profile)).toBeNull()
  })
})

describe('returningVisitor', () => {
  it('is false on a first visit, even once this visit has saved a name', async () => {
    const first = await visit()
    first.saveProfile('Zezima', 'aggy')
    expect(first.returningVisitor).toBe(false)
    expect((await visit()).returningVisitor).toBe(true)
  })

  it('counts a stored profile whose name the rules no longer take', async () => {
    localStorage.setItem('jbi:profile', JSON.stringify({ name: '<b>bold</b>' }))
    const page = await visit()
    expect(get(page.profile)).toBeNull()
    expect(page.returningVisitor).toBe(true)
  })

  it('is false when storage throws', async () => {
    storageThrows()
    expect((await visit()).returningVisitor).toBe(false)
  })
})
