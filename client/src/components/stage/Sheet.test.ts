/** The stage hangs the theme's sheet and follows a change of theme. */

import { cleanup, render } from '@testing-library/svelte'
import { createRawSnippet, tick } from 'svelte'
import { afterEach, describe, expect, it } from 'vitest'

import skull from '../../assets/sprites/skull.svg'
import StageView from './StageView.svelte'

const paper = createRawSnippet(() => ({
  render: () => '<p>Which boss drops the Tanzanite fang?</p>',
}))

function stage(theme: string) {
  document.documentElement.dataset.theme = theme
  const { container } = render(StageView, { paper })
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

  it("is a bounty poster in the Wilderness, the game's skull behind its words, with no rolls", () => {
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
    expect(party.querySelectorAll('.bunting .swag')).toHaveLength(2)
    expect(party.querySelectorAll('.bunting .knot')).toHaveLength(3)
    expect(party.querySelectorAll('.bunting .flag')).toHaveLength(8)
    expect(party.querySelector('.roll')).toBeNull()
    cleanup()

    const slab = stage('tzhaar').sheet
    expect(slab.dataset.sheet).toBe('slab')
    expect(slab.querySelector('.facets')).not.toBeNull()
    expect(slab.querySelector('.roll')).toBeNull()
  })

  it('is bark cloth in a bamboo frame lashed at its corners in the jungle', () => {
    const { container, sheet } = stage('jungle')
    expect(sheet.dataset.sheet).toBe('bamboo')
    expect(sheet.querySelectorAll('svg.pole')).toHaveLength(4)
    expect(sheet.querySelectorAll('svg.lashing')).toHaveLength(4)
    expect(sheet.querySelector('.roll')).toBeNull()
    expect(container.querySelector('.stage-row')?.classList.contains('flat')).toBe(true)
  })

  it("is the Gauntlet's board in the Gauntlet, its corners cut and no close button", () => {
    const { sheet } = stage('gauntlet')
    expect(sheet.dataset.sheet).toBe('gauntlet')
    expect(sheet.querySelector('.paper svg.close')).toBeNull()
    expect(sheet.querySelectorAll('.paper svg.cut')).toHaveLength(4)
    expect(sheet.querySelector('.roll')).toBeNull()
  })

  it("is the Gauntlet's board in the Corrupted Gauntlet too", () => {
    const { sheet } = stage('corrupted_gauntlet')
    expect(sheet.dataset.sheet).toBe('gauntlet')
    expect(sheet.querySelectorAll('.paper svg.cut')).toHaveLength(4)
  })

  it('is a gravestone in Morytania, moss at its foot and nothing under it', () => {
    const { sheet } = stage('morytania')
    expect(sheet.dataset.sheet).toBe('gravestone')
    expect(sheet.querySelector('.paper svg.moss')).not.toBeNull()
    expect(sheet.querySelector('.paper svg.crack')).not.toBeNull()
    expect(sheet.querySelector('svg.mound')).toBeNull()
    expect(sheet.querySelector('.roll')).toBeNull()
  })

  it('is teal stone in Zanaris, crystal at its corners and sides, mushrooms at its foot', () => {
    const { sheet } = stage('zanaris')
    expect(sheet.dataset.sheet).toBe('sign')
    expect(sheet.querySelector('.paper svg.altar')).toBeNull()
    expect(sheet.querySelector('.paper .facets')).not.toBeNull()
    expect(sheet.querySelectorAll('.paper svg.shard')).toHaveLength(6)
    expect(sheet.querySelectorAll('.paper img.mushrooms')).toHaveLength(2)
    expect(sheet.querySelector('.roll')).toBeNull()
  })

  it('keeps the words on the sheet whatever it is', () => {
    const themes = [
      'jolly',
      'pollnivneach',
      'wilderness',
      'party_room',
      'tzhaar',
      'jungle',
      'gauntlet',
      'corrupted_gauntlet',
      'morytania',
      'zanaris',
    ]
    for (const theme of themes) {
      const { sheet } = stage(theme)
      expect(sheet.querySelector('.paper .content')?.textContent).toBe(
        'Which boss drops the Tanzanite fang?',
      )
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
})

describe('the sheet on the stage', () => {
  const guest = { guest: 'boar', returning: true }

  function words(props: Record<string, unknown>) {
    document.documentElement.dataset.theme = 'jolly'
    const { container } = render(StageView, { paper, ...props })
    return container.querySelector('.scroll .content') as HTMLElement
  }

  it('takes its words off when a random event hands the stage back, beside or under the bubble', () => {
    expect(words({}).classList.contains('hidden')).toBe(false)
    cleanup()
    expect(words(guest).classList.contains('hidden')).toBe(true)
    cleanup()
    expect(words({ ...guest, bubble: 'on' }).classList.contains('hidden')).toBe(true)
  })

  it("stretches to the TV's height, and runs edge to edge on a phone everywhere", () => {
    const phone = stage('jolly').sheet
    expect(phone.classList.contains('fill')).toBe(false)
    expect(phone.classList.contains('edge')).toBe(true)
    cleanup()
    document.documentElement.dataset.theme = 'jolly'
    const { container } = render(StageView, { paper, tv: true })
    expect(container.querySelector('.scroll')!.classList.contains('fill')).toBe(true)
  })
})
