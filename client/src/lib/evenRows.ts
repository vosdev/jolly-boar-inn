/**
 * How many of `count` equal items go on a row so the rows come out even, when at most
 * `fit` fit on one: as few rows as `fit` allows, and no row left with a straggler.
 */
export function perRow(count: number, fit: number): number {
  if (count <= 0 || fit <= 0) return Math.max(1, fit)
  const rows = Math.ceil(count / fit)
  return Math.ceil(count / rows)
}

/** How many items `size` wide, `gap` apart, fit in `width`. */
export function fitting(width: number, size: number, gap: number): number {
  return Math.max(1, Math.floor((width + gap) / (size + gap)))
}
