/**
 * Create's random events strip: the host's askers first, then a silhouette for every
 * surprise, changing to other NPCs from the roster so none of them reads as a promise.
 */

import { act, cleanup, render } from '@testing-library/svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { CustomQuestion } from '../lib/customQuestions'
import RandomEvents from './RandomEvents.svelte'

const SWAP_MS = 2500

function slots(): HTMLLIElement[] {
  return [...document.querySelectorAll<HTMLLIElement>('.pips li')]
}

/** The picture each surprise's silhouette is cut from, in slot order. */
function shadows(): string[] {
  return [...document.querySelectorAll<HTMLElement>('.shadow')].map((shadow) =>
    shadow.style.getPropertyValue('--art'),
  )
}

function question(npc?: string): CustomQuestion {
  return { type: 'multiple_choice', payload: {}, random_event: npc }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('RandomEvents', () => {
  it('shows a silhouette of an NPC for every surprise, mirrored to face in', () => {
    render(RandomEvents, { frequency: 'default', slots: 3, own: [] })
    expect(slots().every((slot) => slot.classList.contains('surprise'))).toBe(true)
    expect(shadows()).toHaveLength(3)
    expect(shadows().every((art) => art.startsWith('url('))).toBe(true)
    expect(document.querySelectorAll('.shadow.chathead')).toHaveLength(3)
    expect(document.body.textContent).not.toContain('?')
  })

  it('puts the host’s askers first and silhouettes only in the slots left', () => {
    render(RandomEvents, { frequency: 'default', slots: 3, own: [question('genie')] })
    const [first, ...rest] = slots() as [HTMLLIElement, ...HTMLLIElement[]]
    expect(first.classList.contains('mine')).toBe(true)
    expect(first.querySelector('img')?.getAttribute('src')).toContain('genie_chathead')
    expect(rest.every((slot) => slot.classList.contains('surprise'))).toBe(true)
    expect(shadows()).toHaveLength(2)
  })

  it('changes every silhouette to another NPC each turn, never two the same at once', async () => {
    render(RandomEvents, { frequency: 'default', slots: 4, own: [] })
    const before = shadows()
    expect(new Set(before).size).toBe(4)
    await act(() => vi.advanceTimersByTime(SWAP_MS - 1))
    expect(shadows()).toEqual(before)
    await act(() => vi.advanceTimersByTime(1))
    const after = shadows()
    expect(new Set(after).size).toBe(4)
    expect(after.some((art) => before.includes(art))).toBe(false)
  })

  it('keeps the silhouettes still with reduced motion', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
    }))
    render(RandomEvents, { frequency: 'default', slots: 2, own: [] })
    const before = shadows()
    await act(() => vi.advanceTimersByTime(SWAP_MS * 3))
    expect(shadows()).toEqual(before)
  })
})
