/**
 * A coin amount the way the game writes it: `999`, `12,500`, `100k`, `1.6M`, `10M`.
 *
 * The Price is Right sends its four options as integers and leaves the writing to us
 * (architecture section 2): a pack that baked in `"1.6M"` could no longer be checked
 * against the price it claims to be. So this is where the notation lives, and it follows
 * the game rather than the reader's locale — commas whatever the language, and never a
 * rounding up. The game truncates: a stack of 1,699,999 reads `1.6M`, because it is not
 * yet 1.7M, and a player who has watched a stack tick over knows it.
 *
 * The bands are the game's too. Under 100,000 an amount is written out in full; from
 * there to a million it is whole thousands; up to ten million, millions to one place,
 * dropping a `.0`; and past that whole millions.
 */

const K = 1_000
const M = 1_000_000

export function formatGp(amount: number): string {
  if (!Number.isFinite(amount)) return '?'
  const n = Math.trunc(amount)
  if (n < 0) return `-${formatGp(-n)}`
  if (n < 100 * K) return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  if (n < M) return `${Math.floor(n / K)}k`
  if (n < 10 * M) return `${Math.floor(n / (M / 10)) / 10}M`
  return `${Math.floor(n / M)}M`
}

const SUFFIX: Record<string, string> = { k: 'e3', m: 'e6', b: 'e9' }

/**
 * A number the way a player types one: `formatGp` read back, and then some.
 *
 * `closest_number` asks for a number that is as often a price as anything else, and
 * players write prices the way the game does -- `100k`, `1.6m`, `2.1b` -- so the box takes
 * that as well as `12,500` and `-3.5`. Commas, spaces and underscores are thousands
 * separators and dropped; `.` is the only decimal point, because the game uses nothing
 * else. The suffix is applied by moving the decimal point rather than multiplying, so
 * `1.1m` is 1,100,000 and not 1,100,000.0000000002.
 *
 * Null for anything else, which is what keeps Submit disabled.
 */
export function parseAmount(text: string): number | null {
  const cleaned = text.trim().toLowerCase().replace(/[\s,_]/g, '')
  const match = /^(-?(?:\d+\.?\d*|\.\d+))([kmb]?)$/.exec(cleaned)
  if (match === null) return null
  const value = Number(match[1] + (SUFFIX[match[2] ?? ''] ?? ''))
  return Number.isFinite(value) ? value : null
}
