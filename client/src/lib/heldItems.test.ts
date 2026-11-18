import { get } from 'svelte/store'
import { afterEach, describe, expect, it } from 'vitest'

import { canUse, heldIcon, itemLine, itemName, itemPoints, shownItems, signed } from './heldItems'
import type { OpenQuestion, PlayerResult, PlayerView, RoomView } from './protocol'
import { lastClosed, players, room } from './stores'

const result = (item: string | null, itemPoints: number, points = 120): PlayerResult => ({
  value: 0,
  correct: true,
  credit: 1,
  points,
  item_points: itemPoints,
  item,
  by_book: false,
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

  it('counts Ring of wealth down from (3) to (1), on the one ring icon', () => {
    expect([3, 2, 1].map((charges) => itemName('ring_of_wealth', charges))).toEqual([
      'Ring of wealth (3)',
      'Ring of wealth (2)',
      'Ring of wealth (1)',
    ])
    const files = { '../assets/items/2572.png': '/ring.png' }
    expect([3, 2, 1].map((charges) => heldIcon('ring_of_wealth', charges, files))).toEqual([
      '/ring.png',
      '/ring.png',
      '/ring.png',
    ])
    expect(itemLine('ring_of_wealth')).toBe(
      'Three charges. Each takes wrong answers off a multiple choice question, only for you.',
    )
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

describe('used items', () => {
  const asked = (type = 'multiple_choice', you_can_answer = true) =>
    ({ type, you_can_answer }) as OpenQuestion

  it('can be used only while held, on a question you may answer, once', () => {
    const lamp = { id: 'xp_lamp', charges: null }
    expect(canUse(lamp, asked(), false, false)).toBe(true)
    expect(canUse(null, asked(), false, false)).toBe(false)
    expect(canUse(lamp, null, false, false)).toBe(false)
    expect(canUse(lamp, asked(), false, true)).toBe(false)
    expect(canUse(lamp, asked('multiple_choice', false), false, false)).toBe(false)
    expect(canUse({ id: 'ring_of_life', charges: null }, asked(), false, false)).toBe(false)
  })

  it('takes a Kebab after answering, and Charos, the Book and the lamp only before', () => {
    expect(canUse({ id: 'kebab', charges: null }, asked(), true, false)).toBe(true)
    for (const id of ['ring_of_charos', 'book_of_knowledge', 'xp_lamp']) {
      expect(canUse({ id, charges: null }, asked(), true, false)).toBe(false)
    }
  })

  it('refuses Charos and the lamp on More or Less, not the Kebab or the Book', () => {
    const more = asked('more_less')
    expect(canUse({ id: 'ring_of_charos', charges: null }, more, false, false)).toBe(false)
    expect(canUse({ id: 'xp_lamp', charges: null }, more, false, false)).toBe(false)
    expect(canUse({ id: 'kebab', charges: null }, more, false, false)).toBe(true)
    expect(canUse({ id: 'book_of_knowledge', charges: null }, more, false, false)).toBe(true)
  })

  it('lists a charmed miss as taken back and a Book answer with its own points', () => {
    const book: PlayerResult = { ...result(null, 0, 800), value: null, by_book: true }
    const rows = itemPoints({ a: result('ring_of_charos', -540, 540), b: book }, {}, [])
    expect(rows).toEqual([
      { playerId: 'a', item: 'ring_of_charos', charges: null, points: -540 },
      { playerId: 'b', item: 'book_of_knowledge', charges: null, points: 800, byBook: true },
    ])
    expect(signed(-540)).toBe('\u2212540')
    expect(signed(1300)).toBe('+1,300')
  })
})
