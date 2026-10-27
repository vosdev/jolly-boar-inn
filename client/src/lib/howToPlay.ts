/**
 * How to play: one row per way of answering, and which rows a room needs.
 *
 * Players overlooked Submit, so every row whose type has one says so in the same words.
 * A row lists the types it covers: types that answer alike, the one-tap ones or the two
 * sliders, share one.
 *
 * Which types a room plays comes from `/api/modes`, the server's say, rather than a copy
 * here. A random event or a host's question can be any type a host or event may use, and
 * the lobby cannot know which, so a room holding either is shown every row; so is a room
 * whose rounds are hidden.
 */

import { getModes, type ModePacing } from './api'
import { CUSTOM_TYPES } from './customQuestions'
import type { RoomSettings } from './protocol'

export type Drawing = 'tap' | 'basket' | 'order' | 'match' | 'text' | 'number' | 'slider' | 'list'

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
    text: 'Drag every right one into the basket, then press Submit.',
    drawing: 'basket',
  },
  {
    types: ['ordering'],
    title: 'Put in order',
    text: 'Drag them into order between the two ends, then press Submit.',
    drawing: 'order',
  },
  {
    types: ['matching'],
    title: 'Match them up',
    text: 'Drag one answer onto each, then press Submit. Some may be left over.',
    drawing: 'match',
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
    types: ['price_is_right', 'number_slider'],
    title: 'Slide to your guess',
    text: 'Slide to your guess, then press Submit. The closer it is, the more it scores.',
    drawing: 'slider',
  },
  {
    types: ['pick_from_list'],
    title: 'Pick from a list',
    text: 'Start typing, pick a name from the list, then press Submit.',
    drawing: 'list',
  },
]

export const SCORING_LINE = 'Quicker and correct answers score more.'

/** A team game scores otherwise, so a room with teams shows this in place of the line above. */
export const TEAMS_PARAGRAPH =
  "In a team game everyone picks a team in the lobby. Speed doesn't count: your team scores the average of its members' points."

/** Home's How to play page: the night in four steps, each a title and a sentence. */
export const NIGHT_STEPS: readonly { title: string; text: string }[] = [
  {
    title: 'Create a room',
    text: 'Pick the hosts, each of whom runs one round, and set the house rules. The room is kept for a few days.',
  },
  {
    title: 'Share the code',
    text: 'Friends join with the code or the invite link. They pick a name and a pet; nobody needs an account.',
  },
  {
    title: 'Play the rounds',
    text: 'Each host asks in their own way, and random events can barge in with questions of their own.',
  },
  {
    title: 'Climb the hiscores',
    text: 'Quicker and correct answers score more, and the hiscores between rounds show who is ahead.',
  },
]

/** The page's Teams section, before `TEAMS_PARAGRAPH`. */
export const TEAMS_SETUP =
  'Whoever creates the room can make it a team game, on Create or later in the lobby, with a team for each god they pick.'

/** After `TEAMS_PARAGRAPH`: what the standings show of a team. */
export const TEAMS_STANDINGS =
  'The hiscores rank the teams, each with its members and their points under it, so a weak link shows.'

/** The page's TV section, a paragraph each. */
export const TV_PARAGRAPHS: readonly string[] = [
  'Playing in one room? Put the game on a TV. Open the room on the TV and join it like anyone else, then whoever created the room taps its pet in the lobby and picks Make TV.',
  'The TV shows every question large, the answers as they come in and the hiscores, for the whole room to see. Everyone answers on their own phone; the TV never answers and scores nothing.',
]

/** The types a round of mode `id` is answered in, by `/api/modes`; null for a mode it does not list. */
export function modeTypes(id: string, modes: ModePacing[]): Set<string> | null {
  const mode = modes.find((entry) => entry.id === id)
  return mode === undefined ? null : new Set(mode.types)
}

/** Whether to explain teams: in a team room, and from Home, where any room might be one. */
export function showsTeams(settings: RoomSettings | null): boolean {
  return settings === null || settings.teams.length > 0
}

/** What a host's question or a random event may be: the custom types, ordering and matching. */
const EVENT_TYPES = [...CUSTOM_TYPES, 'ordering', 'matching']

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

/** The How to play page's address; its views sit under it. */
export const HOW_TO_PATH = '/how-to-play'

const EVENTS_SLUG = 'random-events'

/** A mode's part of the address, from its name, which reads better in a shared link than its id. */
export function slugOf(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/** The address of a view of How to play: `'overview'`, `'events'` or a mode's id. */
export function howToPath(view: string, modes: readonly { id: string; label: string }[]): string {
  if (view === 'events') return `${HOW_TO_PATH}/${EVENTS_SLUG}`
  const mode = modes.find((entry) => entry.id === view)
  return mode === undefined ? HOW_TO_PATH : `${HOW_TO_PATH}/${slugOf(mode.label)}`
}

/**
 * The view at `path`, null when it is not How to play's. A mode it does not know, renamed
 * or retired since the link was shared, gets the overview rather than Home.
 */
export function howToViewOf(
  path: string,
  modes: readonly { id: string; label: string }[],
): string | null {
  if (path === HOW_TO_PATH) return 'overview'
  if (!path.startsWith(`${HOW_TO_PATH}/`)) return null
  const slug = path.slice(HOW_TO_PATH.length + 1)
  if (slug === EVENTS_SLUG) return 'events'
  return modes.find((mode) => slugOf(mode.label) === slug)?.id ?? 'overview'
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
