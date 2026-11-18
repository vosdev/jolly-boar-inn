import { afterEach, describe, expect, it, vi } from 'vitest'

import { dropHandedOn, handOn, type Held, takeOver } from './keptMap'

function held(): Held {
  return { map: { remove: vi.fn() }, canvas: document.createElement('div') } as unknown as Held
}

describe('keptMap', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('removes a map nobody takes by the end of the turn', () => {
    vi.useFakeTimers()
    const map = held()
    handOn(map)
    vi.runAllTimers()
    expect(map.map.remove).toHaveBeenCalledOnce()
    expect(takeOver(document.body)).toBeNull()
  })

  it('drops a handed-on map at once, so its timer has nothing left to remove', () => {
    vi.useFakeTimers()
    const map = held()
    handOn(map)
    dropHandedOn()
    expect(map.map.remove).toHaveBeenCalledOnce()
    expect(takeOver(document.body)).toBeNull()
    vi.runAllTimers()
    expect(map.map.remove).toHaveBeenCalledOnce()
  })
})
