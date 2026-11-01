/**
 * The order of the modes on Create and in the lobby's editor. The server lists them in
 * registry order, which would put the same mode first for everyone; a seed kept in this
 * browser shuffles them instead, so `/create` and the lobby it opens agree.
 */

import { dropStored, readStored, writeStored } from './session'

const SEED_KEY = 'jbi:mode-seed'

/** The seed for this browser's next room, drawn on first use. */
export function modeSeed(): string {
  let seed = readStored(SEED_KEY)
  if (seed === null) {
    seed = Math.random().toString(36).slice(2)
    writeStored(SEED_KEY, seed)
  }
  return seed
}

/** Forget the seed, so the next room's picker is in a new order. */
export function rerollModeSeed(): void {
  dropStored(SEED_KEY)
}

function rank(seed: string, id: string): number {
  let state = 2166136261
  for (const char of `${seed}:${id}`) state = Math.imul(state ^ char.charCodeAt(0), 16777619) >>> 0
  return state
}

/** The modes sorted by a hash of seed and id, so a mode added later moves no other. */
export function orderModes<T extends { id: string }>(modes: readonly T[], seed: string): T[] {
  return [...modes].sort((a, b) => rank(seed, a.id) - rank(seed, b.id) || a.id.localeCompare(b.id))
}
