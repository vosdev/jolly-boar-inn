/** The combobox keys every search-and-pick box shares. */

import { describe, expect, it, vi } from 'vitest'

import { Combobox } from './combobox.svelte'

function key(name: string): KeyboardEvent {
  return new KeyboardEvent('keydown', { key: name, cancelable: true })
}

describe('Combobox', () => {
  it('opens on an arrow, moves within the list, picks on Enter and closes on Escape', async () => {
    const box = new Combobox('x')
    const keys = { count: 3, open: () => (box.expanded = true), pick: vi.fn(), strict: true }
    box.keydown(key('ArrowDown'), keys)
    expect(box.expanded).toBe(true)
    for (let i = 0; i < 5; i++) box.keydown(key('ArrowDown'), keys)
    await Promise.resolve()
    expect(box.active).toBe(2)
    const enter = key('Enter')
    box.keydown(enter, keys)
    expect(keys.pick).toHaveBeenCalledWith(2)
    expect(enter.defaultPrevented).toBe(true)
    box.keydown(key('Escape'), keys)
    expect(box.expanded).toBe(false)
  })

  it('closes a free box on an Enter with nothing to pick, and leaves a strict one open', () => {
    for (const strict of [true, false]) {
      const box = new Combobox('x')
      box.expanded = true
      box.keydown(key('Enter'), { count: 0, open: () => {}, pick: vi.fn(), strict })
      expect(box.expanded).toBe(strict)
    }
  })
})
