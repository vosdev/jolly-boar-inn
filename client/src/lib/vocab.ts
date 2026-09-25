/**
 * The closed lists a `pick_from_list` question is answered from, and the search over them.
 *
 * A list is the same few hundred entries for every question of a round, so it is fetched
 * once per session from `GET /api/vocab/{name}` rather than sent with each question
 * (architecture section 3). `prefetchVocab` starts that fetch as a question naming the
 * list arrives (`listFor`); `loadVocab` is the same fetch for whoever asks first, and
 * every caller after that gets the same promise. A failed fetch is forgotten, so the next
 * caller tries again rather than inheriting the failure for the rest of the evening.
 *
 * The search is what makes a list of names answerable without spelling them, and it is
 * the reason the old `free_text` Guess the Examine needed aliases and this one does not:
 *
 * - It folds case and accents the way `app/questions/vocab.py` does, so what the server
 *   calls one name the search also treats as one.
 * - Each word typed must be the start of a word in the name, in order, so "whip" finds
 *   "Abyssal whip" and "d sc" finds "Dragon scimitar". Punctuation separates words, which
 *   is what lets "ahrim" find "Ahrim's robetop".
 * - Names that start with the query come first, then everything else that matches, each
 *   group alphabetical. An empty query is the whole list, alphabetical.
 * - Each list is folded and sorted once, and the combobox draws only the first
 *   `SHOWN_MAX` matches, so a list of thousands of NPCs keeps up with typing on a phone.
 */

import { getVocab, type Vocab, type VocabEntry } from './api'
import type { OpenQuestion } from './protocol'

export type { Vocab, VocabEntry }

const cache = new Map<string, Promise<Vocab>>()

/** The named list, fetched at most once per session while it keeps succeeding. */
export function loadVocab(name: string): Promise<Vocab> {
  let pending = cache.get(name)
  if (pending === undefined) {
    pending = getVocab(name)
    pending.catch(() => cache.delete(name))
    cache.set(name, pending)
  }
  return pending
}

/** Start fetching a list the next round will need, and ignore how it goes: whoever needs
 * it calls `loadVocab` and hears about a failure then. */
export function prefetchVocab(name: string): void {
  loadVocab(name).catch(() => {})
}

/**
 * The list an open question is answered from, as its own view names it, or null for a
 * question answered some other way. Only `pick_from_list` sends one.
 */
export function listFor(question: OpenQuestion | null): string | null {
  const name = question?.type === 'pick_from_list' ? question.view.vocab : null
  return typeof name === 'string' ? name : null
}

/** For tests: forget every list fetched so far. */
export function clearVocabCache(): void {
  cache.clear()
}

/** Case- and accent-insensitive, the same fold as the server's `vocab.fold`. */
export function fold(text: string): string {
  return text.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase('en')
}

/** Runs of letters and digits, folded: the words a query is matched against. */
export function words(text: string): string[] {
  return fold(text).match(/[\p{L}\p{N}]+/gu) ?? []
}

/** An entry with its name folded, split and ranked once, rather than on every keystroke. */
interface Indexed {
  entry: VocabEntry
  words: string[]
}

/** Each list's entries, alphabetical and folded, built the first time the list is searched. */
const indexes = new WeakMap<readonly VocabEntry[], Indexed[]>()

function indexOf(entries: readonly VocabEntry[]): Indexed[] {
  let index = indexes.get(entries)
  if (index === undefined) {
    const keyed = entries.map((entry) => ({ entry, key: fold(entry.name), words: words(entry.name) }))
    keyed.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : a.entry.id - b.entry.id))
    index = keyed.map(({ entry, words }) => ({ entry, words }))
    indexes.set(entries, index)
  }
  return index
}

/**
 * Where in `name` the query's words start, as a word index, or -1 if they do not.
 * Each query word must prefix a word of the name, consecutive and in order.
 */
function matchAt(name: string[], query: string[]): number {
  for (let start = 0; start + query.length <= name.length; start++) {
    if (query.every((word, offset) => name[start + offset]?.startsWith(word) === true)) return start
  }
  return -1
}

/** How many matches the combobox draws: a phone lists thousands of `<li>`s slowly. */
export const SHOWN_MAX = 50

/** The entries `query` finds, best first. See the module comment for the rules. */
export function search(entries: readonly VocabEntry[], query: string): VocabEntry[] {
  const index = indexOf(entries)
  const wanted = words(query)
  if (wanted.length === 0) return index.map(({ entry }) => entry)
  const first: VocabEntry[] = []
  const rest: VocabEntry[] = []
  for (const { entry, words } of index) {
    const at = matchAt(words, wanted)
    if (at === 0) first.push(entry)
    else if (at > 0) rest.push(entry)
  }
  return [...first, ...rest]
}
