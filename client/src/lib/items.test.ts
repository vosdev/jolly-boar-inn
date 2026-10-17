import { describe, expect, it } from 'vitest'

import { itemIcon } from './items'

const FILES = {
  '../assets/items/4151.png': '/assets/4151-abc.png',
  '../assets/items/41510.webp': '/assets/41510-def.webp',
}

describe('itemIcon', () => {
  it('finds an item’s icon by its id, whatever the extension', () => {
    expect(itemIcon('item:4151', FILES)).toBe('/assets/4151-abc.png')
    expect(itemIcon('item:41510', FILES)).toBe('/assets/41510-def.webp')
  })

  it('has nothing for an item with no file, so its name stands alone', () => {
    expect(itemIcon('item:415', FILES)).toBeNull()
    expect(itemIcon('item:4151', {})).toBeNull()
  })

  it('has nothing for an NPC, a malformed asset or no asset', () => {
    expect(itemIcon('npc:4151', FILES)).toBeNull()
    expect(itemIcon('item:4151.png', FILES)).toBeNull()
    expect(itemIcon('4151', FILES)).toBeNull()
    expect(itemIcon(undefined, FILES)).toBeNull()
    expect(itemIcon(4151, FILES)).toBeNull()
  })
})
