import { get } from 'svelte/store'
import { afterEach, describe, expect, it } from 'vitest'

import { heldIcon, itemName, itemPoints, shownItems } from './heldItems'
import type { PlayerResult, PlayerView, RoomView } from './protocol'
import { lastClosed, players, room } from './stores'

const result = (item: string | null, itemPoints: number, points = 120): PlayerResult => ({
  value: 0,
  correct: true,
  credit: 1,
  points,
  item_points: itemPoints,
  item,
})

const player = (id: string, item: PlayerView['item']): PlayerView => ({
  id,
  display_name: id,
  avatar: null,
  role: 'player',
  team: null,
  connected: true,
  ready: false,
  editing: false,
  item,
})

afterEach(() => {
  players.set([])
  room.set(null)
  lastClosed.set(null)
})

describe('held items', () => {
  it('names an item with its charges left, and picks the icon of that dose', () => {
    expect(itemName('super_restore', 3)).toBe('Super restore (3)')
    expect(itemName('ring_of_life')).toBe('Ring of Life')
    const files = {
      '../assets/items/3026.png': '/three.png',
      '../assets/items/3024.png': '/four.png',
    }
    expect(heldIcon('super_restore', 3, files)).toBe('/three.png')
    expect(heldIcon('super_restore', null, files)).toBe('/four.png')
    expect(heldIcon('phoenix_necklace', null, files)).toBeNull()
  })

  it('lists what each item paid, a potion named as it was before the dose', () => {
    const rows = itemPoints(
      { a: result('super_restore', 140), b: result(null, 0), c: result('ring_of_life', 380) },
      {},
      [player('a', { id: 'super_restore', charges: 3 }), player('c', null)],
    )
    expect(rows).toEqual([
      { playerId: 'a', item: 'super_restore', charges: 4, points: 140 },
      { playerId: 'c', item: 'ring_of_life', charges: null, points: 380 },
    ])
  })

  it('takes a settled item over the answer’s own line, with or without an answer', () => {
    const rows = itemPoints(
      { a: result('phoenix_necklace', 300) },
      {
        a: { item: 'phoenix_necklace', points: 300 },
        d: { item: 'phoenix_necklace', points: 250 },
      },
      [],
    )
    expect(rows.map((row) => [row.playerId, row.points])).toEqual([
      ['a', 300],
      ['d', 250],
    ])
  })

  it('keeps an item that broke on a close through its reveal, then lets it go', () => {
    players.set([player('a', null)])
    lastClosed.set({
      results: { a: result('ring_of_life', 380) },
      settled: {},
    } as never)
    room.set({ phase: 'reveal' } as RoomView)
    expect(get(shownItems).get('a')).toEqual({ id: 'ring_of_life', charges: null })
    room.set({ phase: 'open' } as RoomView)
    expect(get(shownItems).has('a')).toBe(false)
  })
})
