/**
 * What the stage pins on the sheet for our answer (section 8 of ideas/design.md).
 *
 * Any answer worth points earns a pin: right, partial credit or a graded guess. Only full
 * credit throws confetti as well, so a near miss is marked without being celebrated like a
 * hit. `+0`, and no answer at all, get nothing. What the pin is depends on the theme, and in
 * the Wilderness on the points too.
 */

import ribbonUrl from '../assets/stage/ribbon.svg'
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
import type { PlayerResult } from './protocol'

export interface Award {
  kind: 'none' | 'pin' | 'confetti'
  points: number
}

export const NO_AWARD: Award = { kind: 'none', points: 0 }

/** The award for our row of `question_closed.results`, or for no row. */
export function awardFor(result: PlayerResult | null): Award {
  if (result === null || result.points <= 0) return NO_AWARD
  return { kind: result.correct ? 'confetti' : 'pin', points: result.points }
}

/** The picture pinned to the sheet; a `sprite` is a game sprite, drawn at twice its pixels. */
export interface Pin {
  url: string
  sprite: boolean
}

const RIBBON: Pin = { url: ribbonUrl, sprite: false }

const sprite = (url: string): Pin => ({ url, sprite: true })

/** The Bounty Hunter's skull for the points, its tiers rising from bronze through iron, green and blue to red. */
function bountySkull(points: number): string {
  if (points >= 800) return bountySkull5
  if (points >= 600) return bountySkull4
  if (points >= 400) return bountySkull3
  if (points >= 200) return bountySkull2
  return bountySkull1
}

/** The pin for an award of `points` under `theme`; a theme with none of its own keeps the ribbon. */
export function pinFor(theme: string, points: number): Pin {
  switch (theme) {
    case 'pollnivneach':
      return sprite(superKebab)
    case 'tzhaar':
      return sprite(tokkul)
    case 'wilderness':
      return sprite(bountySkull(points))
    case 'jungle':
      return sprite(monkey)
    case 'gauntlet':
    case 'corrupted_gauntlet':
      return sprite(crystalShard)
    case 'morytania':
      return sprite(snelm)
    default:
      return RIBBON
  }
}
