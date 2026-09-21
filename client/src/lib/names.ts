/**
 * Player names: the rules the server holds them to, and a generator for people who would
 * rather not think of one (D3, section 5.1.2 of ideas/design.md).
 *
 * The corpus is `data/player-names.json`: invented usernames in the register of a 2007
 * friends list, never NPC names, so that D4 can never seat somebody called Hans behind a
 * goblin's face. It is a different corpus from `room-words.json` and neither is shaped by
 * the other.
 *
 * Every base is at most 21 characters, so the 1–3 digit suffix always fits under the
 * server's 24. The suffix is also what the client turns over when a room answers
 * `name_taken`: two players who rolled the same base in one room is a `409` that will
 * happen, and it should be the client's problem rather than theirs.
 */

import BASES from '../../../data/player-names.json'

/** `normalize_name` in `server/app/rooms/state.py`. */
export const NAME_MAX = 24

/** Leaves room for a three-digit suffix. `test_player_names.py` holds the corpus to it. */
export const BASE_MAX = 21

/** Code points, the way the server counts: `len()` in Python, not `.length` in UTF-16. */
function length(text: string): number {
  return [...text].length
}

/**
 * Why the server would refuse this name, or null if it would take it. The same rules as
 * `normalize_name`: trimmed, 1–24 characters, no `<` or `>`, and no whitespace but a
 * plain space and no control characters. Uniqueness is the room's to check.
 */
export function nameProblem(raw: string): string | null {
  const name = raw.trim()
  if (name === '') return 'Pick a name.'
  if (length(name) > NAME_MAX) return `At most ${NAME_MAX} characters.`
  if (/[<>]/.test(name)) return 'No < or > in a name.'
  if ([...name].some((ch) => ch.codePointAt(0)! < 32) || /[^\S ]/.test(name)) {
    return 'No line breaks or control characters.'
  }
  return null
}

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]
}

/** 1–999, weighted toward two digits because `Cow31337Killer42` reads better than `…7`. */
function suffix(): string {
  const digits = pick([1, 2, 2, 2, 3])
  const low = digits === 1 ? 1 : 10 ** (digits - 1)
  return String(low + Math.floor(Math.random() * (10 ** digits - low)))
}

/**
 * A fresh name: a base from the corpus and a number.
 *
 * `avoid` is the room code. `CABBAGE` joining room `CABBAGE` is not a bug, but it reads
 * like one, so a base that matches it is skipped. `previous` keeps the re-roll button
 * from handing back the name it was pressed to get rid of.
 */
export function generateName(avoid = '', previous = ''): string {
  const skip = avoid.toLowerCase()
  const bases = BASES.filter((base) => base.toLowerCase() !== skip)
  for (;;) {
    const name = pick(bases) + suffix()
    if (name !== previous) return name
  }
}

/**
 * The same name with a different number on the end, for a room that already has it.
 *
 * Trailing digits come off first, so `AFKFisher42` becomes `AFKFisher517` rather than
 * `AFKFisher42517`, and the stem is cut to the base length so the result is always a name
 * the server takes. A name that is all digits keeps its first one, so there is a stem.
 */
export function resuffix(name: string): string {
  const trimmed = name.trim()
  const stem = trimmed.replace(/\d{1,3}$/, '') || trimmed.slice(0, 1)
  const base = [...stem].slice(0, BASE_MAX).join('')
  for (;;) {
    const next = base + suffix()
    if (next.toLowerCase() !== trimmed.toLowerCase()) return next
  }
}
