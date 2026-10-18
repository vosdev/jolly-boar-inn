/** The stage hangs the theme's sheet, follows a change of theme, and gives Home the inn's notice board. */

import { cleanup, render } from '@testing-library/svelte'
import { createRawSnippet, tick } from 'svelte'
import { afterEach, describe, expect, it } from 'vitest'

import skull from '../../assets/sprites/skull.svg'
import StageView from './StageView.svelte'

const paper = createRawSnippet(() => ({ render: () => '<p>Which boss drops the Tanzanite fang?</p>' }))

function stage(theme: string, board = false) {
  document.documentElement.dataset.theme = theme
  const { container } = render(StageView, { paper, board })
  const sheet = container.querySelector('.scroll') as HTMLElement
  return { container, sheet }
}

afterEach(() => {
  cleanup()
  delete document.documentElement.dataset.theme
})

describe('the sheet', () => {
  it('is the scroll, between its two rolls, in the inn and in Pollnivneach', () => {
    for (const theme of ['jolly', 'pollnivneach']) {
      const { container, sheet } = stage(theme)
      expect(sheet.dataset.sheet).toBe('scroll')
      expect(sheet.querySelectorAll('.roll')).toHaveLength(2)
      expect(container.querySelector('.stage-row')?.classList.contains('flat')).toBe(false)
      cleanup()
    }
  })

  it("is a bounty poster under the game's skull in the Wilderness, with no rolls", () => {
    const { container, sheet } = stage('wilderness')
    expect(sheet.dataset.sheet).toBe('poster')
    expect(sheet.querySelector('.roll')).toBeNull()
    expect(sheet.querySelector('.paper img.skull')?.getAttribute('src')).toBe(skull)
    expect(sheet.querySelectorAll('.fixing')).toHaveLength(2)
    expect(container.querySelector('.stage-row')?.classList.contains('flat')).toBe(true)
  })

  it('is a card under bunting in the Party Room, and an obsidian slab in the TzHaar city', () => {
    const party = stage('party_room').sheet
    expect(party.dataset.sheet).toBe('bunting')
    expect(party.querySelector('svg.bunting')).not.toBeNull()
    expect(party.querySelector('.roll')).toBeNull()
    cleanup()

    const slab = stage('tzhaar').sheet
    expect(slab.dataset.sheet).toBe('slab')
    expect(slab.querySelector('.facets')).not.toBeNull()
    expect(slab.querySelector('.roll')).toBeNull()
  })

  it('keeps the words on the sheet whatever it is', () => {
    for (const theme of ['jolly', 'pollnivneach', 'wilderness', 'party_room', 'tzhaar']) {
      const { sheet } = stage(theme)
      expect(sheet.querySelector('.paper .content')?.textContent).toBe('Which boss drops the Tanzanite fang?')
      cleanup()
    }
  })

  it('changes with the theme while it is up', async () => {
    const { sheet } = stage('jolly')
    document.documentElement.dataset.theme = 'tzhaar'
    await new Promise((settle) => setTimeout(settle))
    await tick()
    expect(sheet.dataset.sheet).toBe('slab')
  })

  it("is Home's notice board in the inn, and the theme's own sheet elsewhere", () => {
    const board = stage('jolly', true).sheet
    expect(board.dataset.sheet).toBe('board')
    expect(board.querySelector('.roll')).toBeNull()
    expect(board.querySelectorAll('.fixing')).toHaveLength(2)
    cleanup()

    expect(stage('wilderness', true).sheet.dataset.sheet).toBe('poster')
  })
})
