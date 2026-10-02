/**
 * The standings split into a podium and a hiscores table (section 7.3). Pure.
 *
 * The server ranks; this only arranges. Ranks are dense (section 6), so a rank is a step
 * and everyone holding it stands on it together: two players level on first share the
 * Diamond step, and the next player along is second, on Platinum, not third.
 *
 * Five steps, one per trophy tier, laid out 4 · 2 · 1 · 3 · 5 from left to right, so first
 * stands in the middle and the steps fall away from it on both sides. A step is always
 * there, even with nobody on it: an empty step with its trophy dimmed says "nobody earned
 * this" where a missing one would look like a layout bug.
 *
 * Nobody with 0 points stands on the podium. The first standings of a quiet room would
 * otherwise be five zero-point winners, and a trophy for answering nothing. Those players
 * are in the table instead, which is why the table between rounds is "everyone not on the
 * podium" rather than "rank 6 down": they are the same list only when all of the top five
 * ranks scored.
 */

import type { Standing } from './protocol'

/** The Quest Speedrunning trophies, first to fifth. The art is `lib/trophies.ts`'s. */
export const TIERS = ['diamond', 'platinum', 'gold', 'silver', 'bronze'] as const
export type Tier = (typeof TIERS)[number]

/** Left to right: the ranks the five steps stand for. */
export const STEP_ORDER = [4, 2, 1, 3, 5] as const

/** Heads a step draws before the rest become a `+N`. */
export const HEADS_PER_STEP = 3

export interface Step {
  rank: number
  tier: Tier
  /** Everyone on this step, in the server's order. Empty for a trophy nobody earned. */
  standings: Standing[]
  /** The ones whose heads are drawn; `standings` past these are the step's `+N`. */
  shown: Standing[]
  /** How many are on the step but not drawn. */
  more: number
}

/** The five steps, left to right. */
export function podium(standings: readonly Standing[]): Step[] {
  return STEP_ORDER.map((rank) => {
    const on = standings.filter((standing) => standing.rank === rank && standing.points > 0)
    return {
      rank,
      tier: TIERS[rank - 1]!,
      standings: on,
      shown: on.slice(0, HEADS_PER_STEP),
      more: Math.max(0, on.length - HEADS_PER_STEP),
    }
  })
}

/** Whether `standing` is on a step: ranks 1 to 5, and something scored. */
export function onPodium(standing: Standing): boolean {
  return standing.rank <= TIERS.length && standing.points > 0
}

/**
 * The hiscores table under the podium. Between rounds it is everyone the podium does not
 * already show. On the final screen it is everyone, ranks 1–5 included, because that is
 * the one place a name too long for its step is guaranteed to be read in full.
 */
export function tableRows(standings: readonly Standing[], final: boolean): Standing[] {
  return final ? [...standings] : standings.filter((standing) => !onPodium(standing))
}
