/**
 * How the stage passes from one screen to the next (section 8 of ideas/design.md), as
 * numbers a test can check without a stage.
 *
 * The room keeps one stage for the whole visit. When a screen hands it over, the old
 * words fade off the sheet, the scroll moves to its new size and place, and only then
 * do the new words appear. If somebody else is to stand beside it, the old host leaves
 * with the words and the new one walks on once the scroll is in place, before the words.
 */

import { reducedMotion } from './interlude'

/** Who stands on a stage and what it shows: what decides how a new screen takes it over. */
export interface Cast {
  /** The NPC id of the host. */
  host: string
  /** A picture standing in the host's place: the lobby's. */
  hero: string | null
  /** A random event's NPC, standing while the event has the floor. */
  guest: string | null
  /** The host at the sheet's top: the hiscores. */
  tall: boolean
  /** What the screen shows, so a question going from open to revealed stays put. */
  scene: string | null
  /** A random event playing its own entrance (section 12). */
  entering: boolean
  /** How long the new screen can wait before its words must be up, in ms. */
  within: number
}

/** The parts of a hand-over, in ms, and when the new words appear. */
export interface Handoff {
  kind: 'cut' | 'same' | 'swap'
  out: number
  move: number
  in: number
  arrival: number
}

export const WORDS_OUT_MS = 150
export const HOST_OUT_MS = 200
export const MOVE_MS = 250
export const HOST_IN_MS = 200
/** The new words fade up over this, from their arrival. */
export const WORDS_IN_MS = 150

/** No hand-over: the new screen is simply there. */
export const CUT: Handoff = { kind: 'cut', out: 0, move: 0, in: 0, arrival: 0 }
const SAME: Handoff = {
  kind: 'same',
  out: WORDS_OUT_MS,
  move: MOVE_MS,
  in: 0,
  arrival: WORDS_OUT_MS + MOVE_MS,
}
const SWAP: Handoff = {
  kind: 'swap',
  out: HOST_OUT_MS,
  move: MOVE_MS,
  in: HOST_IN_MS,
  arrival: HOST_OUT_MS + MOVE_MS + HOST_IN_MS,
}

/** A cast from what a screen says about its stage; the rest is a round's plain stage. */
export function castOf(parts: Partial<Cast> & { host: string }): Cast {
  return {
    hero: null,
    guest: null,
    tall: false,
    scene: null,
    entering: false,
    within: Infinity,
    ...parts,
  }
}

/** Who the room sees standing there, and where. */
function standing(cast: Cast): string {
  const who = cast.hero !== null ? `hero ${cast.hero}` : (cast.guest ?? cast.host)
  return `${who} ${cast.tall ? 'top' : 'foot'}`
}

/**
 * How `to` takes the stage over from `from`, which is null when nothing was on it.
 *
 * A first stage, the same screen moving on (a question's reveal), and a random event,
 * which has its own entrance and return, are cuts. So is anything under reduced motion,
 * and a screen that could not wait for the hand-over: a question that arrived late must
 * not hide its answers past `answerable_at`.
 */
export function handoffFor(from: Cast | null, to: Cast, motion = !reducedMotion()): Handoff {
  if (from === null || !motion) return CUT
  if (to.entering || to.guest !== null) return CUT
  if (to.scene !== null && to.scene === from.scene) return CUT
  const handoff = standing(from) === standing(to) ? SAME : SWAP
  return handoff.arrival > to.within ? CUT : handoff
}
