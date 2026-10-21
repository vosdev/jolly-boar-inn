/**
 * How to play: one row per way of answering, and which rows a room needs.
 *
 * Players overlooked Submit, so every row whose type has one says so in the same words.
 * A row lists the types it covers: the three one-tap types answer alike, so they share one.
 *
 * Which types a room plays comes from `/api/modes`, the server's say, rather than a copy
 * here. A random event or a host's question can be any type a host or event may use, and
 * the lobby cannot know which, so a room holding either is shown every row; so is a room
 * whose rounds are hidden.
 */

import { getModes, type ModePacing } from './api'
import { CUSTOM_TYPES } from './customQuestions'
import type { RoomSettings } from './protocol'

export type Drawing = 'tap' | 'ticks' | 'order' | 'text' | 'number' | 'list'

export interface HowToRow {
  types: string[]
  title: string
  /** Plain words; every "Submit" in it is drawn bold. */
  text: string
  drawing: Drawing
}

export const HOW_TO_ROWS: HowToRow[] = [
  {
    types: ['multiple_choice', 'more_less'],
    title: 'One answer',
    text: 'Tap one answer.',
    drawing: 'tap',
  },
  {
    types: ['pick_all_that_apply'],
    title: 'Pick all that apply',
    text: 'Tap every right one, then press Submit.',
    drawing: 'ticks',
  },
  {
    types: ['ordering'],
    title: 'Put in order',
    text: 'Drag them into order between the two ends, then press Submit.',
    drawing: 'order',
  },
  {
    types: ['free_text'],
    title: 'Type the answer',
    text: "Type your answer, then press Submit or Enter. Capitals and small typos don't matter.",
    drawing: 'text',
  },
  {
    types: ['closest_number'],
    title: 'Closest number',
    text: 'Type a number, then press Submit. 12500, 1600k and 1.8m all work.',
    drawing: 'number',
  },
  {
    types: ['price_is_right'],
    title: 'Slide to a price',
    text: 'Slide to your guess, then press Submit. The closer it is, the more it scores.',
    drawing: 'number',
  },
  {
    types: ['pick_from_list'],
    title: 'Pick from a list',
    text: 'Start typing, pick a name from the list, then press Submit.',
    drawing: 'list',
  },
]

export const SCORING_LINE = 'Quicker and correct answers score more.'

/** What a host's question or a random event may be: the custom types, and ordering's own form. */
const EVENT_TYPES = [...CUSTOM_TYPES, 'ordering']

/** Every type this build plays: every offered mode's, and what an event may be. */
export function allTypes(modes: ModePacing[]): Set<string> {
  return new Set([...modes.flatMap((mode) => mode.types), ...EVENT_TYPES])
}

/**
 * The types a room's questions can be. Its rounds' types alone only when the room holds
 * nothing else: its question count is exactly its rounds', none is hidden, and every
 * round's mode is one this build still offers.
 */
export function roomTypes(settings: RoomSettings, total: number, modes: ModePacing[]): Set<string> {
  const roundQuestions = settings.modes.reduce((sum, round) => sum + round.questions, 0)
  const byId = new Map(modes.map((mode) => [mode.id, mode.types]))
  const known = settings.modes.every((round) => byId.has(round.mode))
  if (settings.hide_rounds === true || total !== roundQuestions || !known) return allTypes(modes)
  return new Set(settings.modes.flatMap((round) => byId.get(round.mode) ?? []))
}

/** The rows that cover any of these types, in the order they are listed. */
export function rowsFor(types: Set<string>): HowToRow[] {
  return HOW_TO_ROWS.filter((row) => row.types.some((type) => types.has(type)))
}

let loading: Promise<ModePacing[]> | null = null

/** `/api/modes`, fetched once per page; a failure is tried again on the next call. */
export function loadModes(): Promise<ModePacing[]> {
  loading ??= getModes().catch((failure: unknown) => {
    loading = null
    throw failure
  })
  return loading
}
