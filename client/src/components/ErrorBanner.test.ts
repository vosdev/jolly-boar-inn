import { fireEvent, render, screen } from '@testing-library/svelte'
import { tick } from 'svelte'
import { get } from 'svelte/store'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { lastError } from '../lib/stores'
import ErrorBanner, { SHOWN_MS } from './ErrorBanner.svelte'

beforeEach(() => {
  vi.useFakeTimers()
  lastError.set(null)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('ErrorBanner', () => {
  it('floats a refusal in the player words, then lets it go on its own', async () => {
    render(ErrorBanner)
    lastError.set({ t: 'error', code: 'not_open', message: 'no question is open' })
    await tick()
    expect(screen.getByRole('alert').textContent).toContain('Too late, that question had closed.')
    vi.advanceTimersByTime(SHOWN_MS - 1)
    expect(get(lastError)).not.toBeNull()
    vi.advanceTimersByTime(1)
    expect(get(lastError)).toBeNull()
  })

  it('gives a newer refusal its own full time', async () => {
    render(ErrorBanner)
    lastError.set({ t: 'error', code: 'not_open', message: 'no question is open' })
    await tick()
    vi.advanceTimersByTime(SHOWN_MS - 1000)
    lastError.set({ t: 'error', code: 'already_answered', message: 'already answered' })
    await tick()
    vi.advanceTimersByTime(SHOWN_MS - 1)
    expect(get(lastError)?.code).toBe('already_answered')
    vi.advanceTimersByTime(1)
    expect(get(lastError)).toBeNull()
  })

  it('goes at once when dismissed', async () => {
    render(ErrorBanner)
    lastError.set({ t: 'error', code: 'not_open', message: 'no question is open' })
    await tick()
    await fireEvent.click(screen.getByRole('button', { name: 'dismiss' }))
    expect(get(lastError)).toBeNull()
  })
})
