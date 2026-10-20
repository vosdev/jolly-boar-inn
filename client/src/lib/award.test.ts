/** What the sheet pins for an answer: any points earn a pin, full credit confetti too, and the theme picks the pin. */

import { describe, expect, it } from 'vitest'

import ribbon from '../assets/stage/ribbon.svg'
import bountySkull1 from '../assets/sprites/bounty-skull-1.svg'
import bountySkull2 from '../assets/sprites/bounty-skull-2.svg'
import bountySkull3 from '../assets/sprites/bounty-skull-3.svg'
import bountySkull4 from '../assets/sprites/bounty-skull-4.svg'
import bountySkull5 from '../assets/sprites/bounty-skull-5.svg'
import crystalShard from '../assets/sprites/crystal-shard.svg'
import monkey from '../assets/sprites/monkey.svg'
import snelm from '../assets/sprites/snelm.svg'
import superKebab from '../assets/sprites/super-kebab.svg'
import tokkul from '../assets/sprites/tokkul.svg'
import { NO_AWARD, awardFor, pinFor } from './award'

describe('awardFor', () => {
  it('throws confetti for full credit', () => {
    expect(awardFor({ value: 0, correct: true, credit: 1, points: 850 })).toEqual({
      kind: 'confetti',
      points: 850,
    })
  })

  it('pins alone on partial credit or a graded guess that scored', () => {
    expect(awardFor({ value: 'Zezma', correct: false, credit: 0.9, points: 400 })).toEqual({
      kind: 'pin',
      points: 400,
    })
    expect(awardFor({ value: 120, correct: false, credit: 0.3, points: 1 })).toEqual({
      kind: 'pin',
      points: 1,
    })
  })

  it('gives +0 and no answer nothing', () => {
    expect(awardFor({ value: 1, correct: false, credit: 0, points: 0 })).toBe(NO_AWARD)
    expect(awardFor(null)).toBe(NO_AWARD)
  })
})

describe('pinFor', () => {
  it('keeps the ribbon in the inn, the Party Room and a theme it does not know', () => {
    for (const theme of ['jolly', 'party_room', '', 'from_a_newer_build']) {
      expect(pinFor(theme, 800)).toEqual({ url: ribbon, sprite: false })
    }
  })

  it('pins a super kebab in Pollnivneach and Tokkul in the TzHaar city, whatever the points', () => {
    for (const points of [1, 600, 1000]) {
      expect(pinFor('pollnivneach', points)).toEqual({ url: superKebab, sprite: true })
      expect(pinFor('tzhaar', points)).toEqual({ url: tokkul, sprite: true })
    }
  })

  it('pins a monkey in the jungle, a crystal shard in the Gauntlet and a snelm in Morytania', () => {
    for (const points of [1, 600, 1000]) {
      expect(pinFor('jungle', points)).toEqual({ url: monkey, sprite: true })
      expect(pinFor('gauntlet', points)).toEqual({ url: crystalShard, sprite: true })
      expect(pinFor('morytania', points)).toEqual({ url: snelm, sprite: true })
    }
  })

  it("pins the Wilderness's Bounty Hunter skull for the points: bronze, iron, green, blue, red", () => {
    const skull = (points: number) => pinFor('wilderness', points).url
    expect([1, 199].map(skull)).toEqual([bountySkull1, bountySkull1])
    expect([200, 399].map(skull)).toEqual([bountySkull2, bountySkull2])
    expect([400, 599].map(skull)).toEqual([bountySkull3, bountySkull3])
    expect([600, 799].map(skull)).toEqual([bountySkull4, bountySkull4])
    expect([800, 1000].map(skull)).toEqual([bountySkull5, bountySkull5])
    expect(pinFor('wilderness', 700)).toMatchObject({ sprite: true })
  })
})
