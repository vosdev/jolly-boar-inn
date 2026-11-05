/**
 * Seeded randomness that every browser computes the same, for orders a whole room must share:
 * a string hash, a generator, and a shuffle over any generator.
 */

/** FNV-1a over `text`: the same 32 bits in every browser. */
export function fnv1a(text: string): number {
  let state = 2166136261
  for (const char of text) state = Math.imul(state ^ char.charCodeAt(0), 16777619) >>> 0
  return state
}

/** A seeded stream of numbers in [0, 1): small and fast, for scatter and order, not secrecy. */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = Math.imul(state ^ (state >>> 15), state | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 0..n-1 in a Fisher-Yates order drawn from `next`, a stream in [0, 1). */
export function shuffle(n: number, next: () => number): number[] {
  const order = Array.from({ length: n }, (_, i) => i)
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1))
    ;[order[i], order[j]] = [order[j]!, order[i]!]
  }
  return order
}
