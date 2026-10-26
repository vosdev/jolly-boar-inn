/**
 * Player names: the rules the server holds them to, and a generator for people who would
 * rather not think of one (section 5.1.2 of ideas/design.md).
 *
 * The corpus is `data/player-names.json`: invented usernames in the register of a 2007
 * friends list, never NPC names, so that a chat head can never seat somebody called Hans behind a
 * goblin's face. It is a different corpus from `room-words.json` and neither is shaped by
 * the other.
 *
 * Every base is a whole name of at most 12 characters, as in OSRS, and is handed out
 * bare. A room that answers `name_taken` gets the base with a 1–3 digit suffix, its end
 * cut to make room: two players who rolled the same base in one room is a `409` that
 * will happen, and it should be the client's problem rather than theirs.
 */

import BASES from '../../../data/player-names.json'

/** `normalize_name` in `server/app/rooms/models.py`. `test_player_names.py` holds the corpus to it. */
export const NAME_MAX = 12

/** Code points, the way the server counts: `len()` in Python, not `.length` in UTF-16. */
function length(text: string): number {
  return [...text].length
}

/** `_LATIN_LETTERS` in `server/app/rooms/models.py`, then digits, space, `_` and `-`. */
const ALLOWED = /^[A-Za-z\u00c0-\u00d6\u00d8-\u00f6\u00f8-\u024f\u1e00-\u1eff0-9 _-]*$/

/** The name as the server stores it: NFKC, trimmed, and runs of spaces made one. */
export function normalizeName(raw: string): string {
  return raw.normalize('NFKC').trim().replace(/ {2,}/g, ' ')
}

/**
 * Why the server would refuse this name, or null if it would take it. The same rules as
 * `normalize_name`, checked on `normalizeName(raw)`: 1 to `NAME_MAX` characters of Latin
 * letters, accents included, digits, spaces, `_` and `-`. Uniqueness is the room's to check.
 */
export function nameProblem(raw: string): string | null {
  const name = normalizeName(raw)
  if (name === '') return 'Pick a name.'
  if (length(name) > NAME_MAX) return `At most ${NAME_MAX} characters.`
  if (!ALLOWED.test(name)) return 'Only letters, digits, spaces, _ and - in a name.'
  return null
}

function pick<T>(items: readonly T[]): T {
  const item = items[Math.floor(Math.random() * items.length)]
  if (item === undefined) throw new Error('nothing to pick from')
  return item
}

/** 1–999, weighted toward two digits because `BondBuyer42` reads better than `…7`. */
function suffix(): string {
  const digits = pick([1, 2, 2, 2, 3])
  const low = digits === 1 ? 1 : 10 ** (digits - 1)
  return String(low + Math.floor(Math.random() * (10 ** digits - low)))
}

/**
 * A fresh name: a base from the corpus, bare.
 *
 * `avoid` is the room code. `CABBAGE` joining room `CABBAGE` is not a bug, but it reads
 * like one, so a base that matches it is skipped. `previous` keeps the re-roll button
 * from handing back the name it was pressed to get rid of.
 */
export function generateName(avoid = '', previous = ''): string {
  const skip = avoid.toLowerCase()
  const bases = BASES.filter((base) => base.toLowerCase() !== skip)
  for (;;) {
    const name = pick(bases)
    if (name !== previous || bases.length < 2) return name
  }
}

/**
 * The same name with a different number on the end, for a room that already has it.
 *
 * Trailing digits come off first, so `AFKFisher42` becomes `AFKFisher517` rather than
 * `AFKFisher42517`, and letters come off the stem's end until the number fits, so
 * `GrindingGreg` becomes `GrindingGr42`: always a name the server takes. A name that is
 * all digits keeps its first one, so there is a stem.
 */
export function resuffix(name: string): string {
  const trimmed = name.trim()
  const stem = trimmed.replace(/\d{1,3}$/, '') || trimmed.slice(0, 1)
  for (;;) {
    const number = suffix()
    const next =
      [...stem]
        .slice(0, NAME_MAX - number.length)
        .join('')
        .trimEnd() + number
    if (next.toLowerCase() !== trimmed.toLowerCase()) return next
  }
}
