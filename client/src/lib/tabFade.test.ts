import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { stubAnimations } from '../test-animate'
import { tabFade } from './tabFade'

let unstub: () => void

beforeEach(() => {
  vi.useFakeTimers()
  unstub = stubAnimations()
})

afterEach(() => {
  unstub()
  vi.useRealTimers()
})

describe('tabFade', () => {
  it('starts as it is told, without a fade', () => {
    const node = document.createElement('div')
    tabFade(node, true)
    expect(node.hidden).toBe(true)
  })

  it('shows the new tab only after the old one has faded out', () => {
    const old = document.createElement('div')
    const fresh = document.createElement('div')
    const oldTab = tabFade(old, false)
    const freshTab = tabFade(fresh, true)
    oldTab.update(true)
    freshTab.update(false)
    expect(old.hidden).toBe(false)
    expect(fresh.hidden).toBe(true)
    vi.advanceTimersByTime(150)
    expect(old.hidden).toBe(true)
    expect(fresh.hidden).toBe(false)
  })

  it('lets the last change win when tabs are switched quickly', () => {
    const node = document.createElement('div')
    const tab = tabFade(node, false)
    tab.update(true)
    vi.advanceTimersByTime(100)
    tab.update(false)
    vi.advanceTimersByTime(1000)
    expect(node.hidden).toBe(false)
  })

  it('cuts under reduced motion', () => {
    const real = window.matchMedia
    window.matchMedia = ((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
    })) as typeof window.matchMedia
    try {
      const node = document.createElement('div')
      const tab = tabFade(node, false)
      tab.update(true)
      expect(node.hidden).toBe(true)
    } finally {
      window.matchMedia = real
    }
  })
})
