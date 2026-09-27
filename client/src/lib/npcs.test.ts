/**
 * D14: an NPC's art is found by name, the render for the stage and the chathead for a
 * phone, and whichever is missing falls back to the other, then to the innkeeper.
 */

import { describe, expect, it } from 'vitest'

import { npcArt } from './npcs'

const INNKEEPER = { '../assets/npcs/innkeeper.svg': '/assets/innkeeper.svg' }

describe('npcArt', () => {
  it('takes the render for the stage and the chathead for a phone', () => {
    const files = {
      ...INNKEEPER,
      '../assets/npcs/ali_morrisane.png': '/assets/ali.png',
      '../assets/npcs/ali_morrisane_chathead.webp': '/assets/ali-head.webp',
    }
    expect(npcArt('ali_morrisane', files)).toEqual({
      body: { url: '/assets/ali.png', cut: 'render' },
      head: { url: '/assets/ali-head.webp', cut: 'chathead' },
    })
  })

  it('shows the one file an NPC has at both sizes', () => {
    const render = { ...INNKEEPER, '../assets/npcs/examiner.png': '/assets/examiner.png' }
    expect(npcArt('examiner', render).head).toEqual({ url: '/assets/examiner.png', cut: 'render' })
    const head = { ...INNKEEPER, '../assets/npcs/examiner_chathead.png': '/assets/e-head.png' }
    expect(npcArt('examiner', head).body).toEqual({ url: '/assets/e-head.png', cut: 'chathead' })
  })

  it('draws an .svg as it is, uncropped and unmirrored', () => {
    expect(npcArt('innkeeper', INNKEEPER).body).toEqual({ url: '/assets/innkeeper.svg', cut: 'drawing' })
  })

  it('stands the innkeeper in for an NPC with no files', () => {
    const art = npcArt('examiner', INNKEEPER)
    expect(art.body.url).toBe('/assets/innkeeper.svg')
    expect(art.head.url).toBe('/assets/innkeeper.svg')
  })

  it('does not take one NPC for another whose id starts the same', () => {
    const files = { ...INNKEEPER, '../assets/npcs/grand_exchange_clerk_2.png': '/assets/other.png' }
    expect(npcArt('grand_exchange_clerk', files).body.url).toBe('/assets/innkeeper.svg')
  })

  it('has the innkeeper committed, so the fallback is never empty', () => {
    expect(npcArt('nobody_at_all').body.url).not.toBe('')
  })
})
