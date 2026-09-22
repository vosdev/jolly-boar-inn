/**
 * D9: a trophy render dropped into `assets/trophies/` replaces the tier's committed
 * placeholder by name, and until then the placeholder is always there to draw.
 */

import { describe, expect, it } from 'vitest'

import { TIERS } from './podium'
import { tierName, trophyArt } from './trophies'

const PLACEHOLDERS = {
  '../assets/trophies/placeholder/gold.svg': '/assets/gold-cup.svg',
  '../assets/trophies/placeholder/bronze.svg': '/assets/bronze-cup.svg',
}

describe('trophyArt', () => {
  it('prefers a render named for the tier, whatever its extension', () => {
    const renders = {
      '../assets/trophies/gold.png': '/assets/gold-abc.png',
      '../assets/trophies/diamond.webp': '/assets/diamond-def.webp',
    }
    expect(trophyArt('gold', renders, PLACEHOLDERS)).toEqual({
      url: '/assets/gold-abc.png',
      placeholder: false,
    })
    expect(trophyArt('bronze', renders, PLACEHOLDERS)).toEqual({
      url: '/assets/bronze-cup.svg',
      placeholder: true,
    })
  })

  it('has a committed placeholder for every tier, and no renders in this checkout', () => {
    for (const tier of TIERS) {
      const art = trophyArt(tier)
      expect(art.placeholder).toBe(true)
      expect(art.url).not.toBe('')
    }
  })

  it('names a tier the way a person says it', () => {
    expect(tierName('platinum')).toBe('Platinum')
  })
})
