/**
 * D14: an NPC's art is found by name, its chathead first, then its render, then the
 * innkeeper.
 */

import { describe, expect, it } from 'vitest'

import { npcArt } from './npcs'

const INNKEEPER = { '../assets/npcs/innkeeper.svg': '/assets/innkeeper.svg' }

describe('npcArt', () => {
  it('takes the chathead over the render', () => {
    const files = {
      ...INNKEEPER,
      '../assets/npcs/ali_morrisane.png': '/assets/ali.png',
      '../assets/npcs/ali_morrisane_chathead.webp': '/assets/ali-head.webp',
    }
    expect(npcArt('ali_morrisane', files)).toEqual({ url: '/assets/ali-head.webp', cut: 'chathead' })
  })

  it('shows the render, cropped, for an NPC with no chathead', () => {
    const files = { ...INNKEEPER, '../assets/npcs/examiner.png': '/assets/examiner.png' }
    expect(npcArt('examiner', files)).toEqual({ url: '/assets/examiner.png', cut: 'render' })
  })

  it('draws an .svg as it is, uncropped and unmirrored', () => {
    expect(npcArt('innkeeper', INNKEEPER)).toEqual({ url: '/assets/innkeeper.svg', cut: 'drawing' })
  })

  it('stands the innkeeper in for an NPC with no files', () => {
    expect(npcArt('examiner', INNKEEPER).url).toBe('/assets/innkeeper.svg')
  })

  it('does not take one NPC for another whose id starts the same', () => {
    const files = { ...INNKEEPER, '../assets/npcs/grand_exchange_clerk_2.png': '/assets/other.png' }
    expect(npcArt('grand_exchange_clerk', files).url).toBe('/assets/innkeeper.svg')
  })

  it('has the innkeeper committed, so the fallback is never empty', () => {
    expect(npcArt('nobody_at_all').url).not.toBe('')
  })
})
