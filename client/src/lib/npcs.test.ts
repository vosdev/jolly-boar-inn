/**
 * An NPC's art is found by name, its chathead first, then its render, then the
 * boar.
 */

import { describe, expect, it } from 'vitest'

import { npcArt } from './npcs'

const BOAR = { '../assets/npcs/boar.svg': '/assets/boar.svg' }

describe('npcArt', () => {
  it('takes the chathead over the render', () => {
    const files = {
      ...BOAR,
      '../assets/npcs/ali_morrisane.png': '/assets/ali.png',
      '../assets/npcs/ali_morrisane_chathead.webp': '/assets/ali-head.webp',
    }
    expect(npcArt('ali_morrisane', files)).toEqual({
      url: '/assets/ali-head.webp',
      cut: 'chathead',
    })
  })

  it('shows the render, cropped, for an NPC with no chathead', () => {
    const files = { ...BOAR, '../assets/npcs/examiner.png': '/assets/examiner.png' }
    expect(npcArt('examiner', files)).toEqual({ url: '/assets/examiner.png', cut: 'render' })
  })

  it('draws an .svg as it is, uncropped and unmirrored', () => {
    expect(npcArt('boar', BOAR)).toEqual({ url: '/assets/boar.svg', cut: 'drawing' })
  })

  it('stands the boar in for an NPC with no files', () => {
    expect(npcArt('examiner', BOAR).url).toBe('/assets/boar.svg')
  })

  it('stands the given fallback in before the boar, then the boar', () => {
    const files = { ...BOAR, '../assets/npcs/stranger_chathead.png': '/assets/stranger.png' }
    expect(npcArt('death', files, 'stranger').url).toBe('/assets/stranger.png')
    expect(npcArt('death', BOAR, 'stranger').url).toBe('/assets/boar.svg')
  })

  it('does not take one NPC for another whose id starts the same', () => {
    const files = { ...BOAR, '../assets/npcs/grand_exchange_clerk_2.png': '/assets/other.png' }
    expect(npcArt('grand_exchange_clerk', files).url).toBe('/assets/boar.svg')
  })

  it('has the boar committed, so the fallback is never empty', () => {
    expect(npcArt('nobody_at_all').url).not.toBe('')
  })
})
