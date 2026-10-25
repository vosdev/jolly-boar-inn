/**
 * The room's table column, beside the stage (section 8 of ideas/design.md). A screen's
 * `AtTable` moves what it holds there, the way the shared stage takes a screen's words,
 * so a screen keeps its parts and their effects while the room decides where they stand.
 */

import { getContext, setContext } from 'svelte'

const KEY = Symbol('room table')

export class RoomTable {
  /** The column's element once it is drawn. */
  target = $state<HTMLElement | null>(null)
}

/** Gives the room's screens a table column to put things in. */
export function shareTable(table: RoomTable): void {
  setContext(KEY, table)
}

/** The room's table column, or null where there is none: a preview, a test. */
export function roomTable(): RoomTable | null {
  return getContext<RoomTable | undefined>(KEY) ?? null
}
