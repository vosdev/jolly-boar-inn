/**
 * The operator's renames and removals of popular items, in `/admin`'s Roster tab
 * (`server/app/roster_edits.py`).
 *
 * The roster feeds the price rounds. A change never reaches the running server: it waits
 * as a pending change keyed by the item's id until it is downloaded, applied with
 * `make edit-roster` and committed, then marked as applied. Adding an item stays with
 * suggestions.
 */

import { ITEM_NAME_MAX } from './suggestions'
import { codePoints } from './questionSchema'
import { fold } from './vocab'

export type RosterAction = 'rename' | 'remove'

/** One roster item, as `GET /api/admin/roster` lists it. */
export interface RosterItem {
  id: number
  name: string
}

/** One pending change, as `/api/admin/roster-changes` lists it. */
export interface RosterChange {
  item_id: number
  action: RosterAction
  /** The new name; null for a removal. */
  name: string | null
  /** The name the roster held when the change was made. */
  before: string
  updated_at: string
  exported_at: string | null
  /** False once the running roster no longer holds `item_id`, as after a release. */
  in_roster: boolean
}

/** The items whose name holds every word of `query`, ignoring case and accents. */
export function searchItems(items: readonly RosterItem[], query: string): RosterItem[] {
  const wanted = fold(query).split(/\s+/u).filter(Boolean)
  if (wanted.length === 0) return [...items]
  return items.filter((item) => {
    const name = fold(item.name)
    return wanted.every((word) => name.includes(word))
  })
}

/** Why `name` cannot rename `item`, or null: the server's own checks, before a send. */
export function renameProblem(
  item: RosterItem,
  name: string,
  roster: readonly RosterItem[],
): string | null {
  const typed = name.trim()
  if (typed === '') return 'Give it a name.'
  if (codePoints(typed) > ITEM_NAME_MAX) return `At most ${ITEM_NAME_MAX} characters.`
  if (typed === item.name) return 'That is the name it has.'
  const wanted = fold(typed)
  if (roster.some((other) => other.id !== item.id && fold(other.name) === wanted)) {
    return 'Another item has that name.'
  }
  return null
}

/** Today's file for a download, so two in a day sit side by side. */
export function rosterChangesFileName(now: Date): string {
  return `roster-changes-${now.toISOString().slice(0, 10)}.json`
}
