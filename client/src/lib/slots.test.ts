import { describe, expect, it } from 'vitest'

import { emptySlots, filled, stepped, swapAt, toTray, trayOf } from './slots'

describe('slots', () => {
  it('keeps in the tray whatever no place holds, in shown order', () => {
    expect(emptySlots(3)).toEqual([null, null, null])
    expect(trayOf([null, 3, 0], 5)).toEqual([1, 2, 4])
    expect(toTray([null, 3, 0], 3)).toEqual([null, null, 0])
  })

  it('swaps two placed options, and sends one back for an option from the tray', () => {
    expect(swapAt([0, 1, 2], 0, 2)).toEqual([2, 1, 0])
    expect(swapAt([0, null, 2], 0, 1)).toEqual([null, 0, 2])
    expect(swapAt([0, 1, 2], 4, 1)).toEqual([0, 4, 2])
    expect(swapAt([0, 1, 2], 1, 1)).toEqual([0, 1, 2])
  })

  it('steps an option between places, and to and from the tray', () => {
    expect(stepped([null, null, 0], 3, -1, true, swapAt)).toEqual([null, null, 3])
    expect(stepped([null, null, 3], 3, -1, true, swapAt)).toEqual([null, 3, null])
    expect(stepped([null, 3, 0], 3, 1, true, swapAt)).toEqual([null, 0, 3])
    expect(stepped([null, 0, 3], 3, 1, true, swapAt)).toEqual([null, 0, null])
    expect(stepped([3, 0, null], 3, -1, true, swapAt)).toEqual([3, 0, null])
    expect(stepped([null, 0, 3], 4, 1, true, swapAt)).toEqual([null, 0, 3])
  })

  it('fills the empty places from the top of the tray', () => {
    expect(filled([null, 3, null], 5)).toEqual([0, 3, 1])
    expect(filled([2, null, null, null], 5)).toEqual([2, 0, 1, 3])
  })
})
