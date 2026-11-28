/**
 * The example codes Home's Join field cycles through: real room words (`data/room-words.json`,
 * as the server deals them), short enough to sit whole in the field on any screen, so a
 * player sees at once that it is an example and that codes come in many shapes.
 */
import WORDS from '../../../data/room-words.json'

/** The longest word that fits the field whole on a phone. */
export const HINT_MAX_LETTERS = 14

/** How long each example stays before the next fades in. */
export const HINT_MS = 4000

/** The fade out, then the same back in with the new word. */
export const HINT_FADE_MS = 300

export const HINT_WORDS: readonly string[] = (WORDS as string[]).filter(
  (word) => word.length <= HINT_MAX_LETTERS,
)

/** A word to show other than `current`, picked by `random` (0 to 1). */
export function nextHint(current: string | null, random: () => number = Math.random): string {
  const choices = HINT_WORDS.filter((word) => word !== current)
  return choices[Math.floor(random() * choices.length)] ?? HINT_WORDS[0] ?? ''
}
