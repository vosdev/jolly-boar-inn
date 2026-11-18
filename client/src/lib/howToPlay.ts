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
    text: 'Drag or tap every right answer into the basket, then press Submit.',
    drawing: 'basket',
  },
  {
    types: ['ordering'],
    title: 'Put in order',
    text: 'Drag the answers into order from top to bottom, then press Submit.',
    drawing: 'order',
  },
  {
    types: ['matching'],
    title: 'Match them up',
    text: 'Drag the right answer onto each row, then press Submit. Some options may be left over.',
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
    text: 'Type your guess, then press Submit. Shorthand like 12500, 1600k and 1.8m all work.',
    drawing: 'number',
  },
  {
    types: ['price_is_right', 'number_slider'],
    title: 'Slide to your guess',
    text: "Slide to your guess, then press Submit. Speed doesn't count - the closer you are, the more points you score.",
    drawing: 'slider',
  },
  {
    types: ['pick_from_list'],
    title: 'Pick from a list',
    text: 'Start typing, pick your answer from the list, then press Submit.',
    drawing: 'list',
  },
]

export const SCORING_LINE = 'Quicker and correct answers score more.'

/** Mystery Boxes, before the scoring line wherever a game deals them. */
export const ITEMS_LINE =
  "Behind on points? Between rounds, the bottom half of the hiscores each find a Mystery Box. What's inside helps you in the next round and never costs anyone else a point. Some items work by themselves; the rest have a button to use them on a question."

/** Whether How to play tells of Mystery Boxes: a room with them on and no teams, or no room. */
export function showsItems(settings: RoomSettings | null): boolean {
  return settings === null || (settings.items && settings.teams.length === 0)
}

/** A team game scores otherwise, so a room with teams shows this in place of the line above. */
export const TEAMS_PARAGRAPH =
  "In a team game, everyone joins a god's team in the lobby. Speed doesn't count - your team scores the average of its members' points. Pixel Hunt is the exception: the earlier you name it, the more it pays."

export type WayId = 'free' | 'teams' | 'sofa'

/** How to play's three ways to play; `drawing` is the scene's words for a screen reader. */
export const WAYS_TO_PLAY: readonly { id: WayId; title: string; text: string; drawing: string }[] =
  [
    {
      id: 'free',
      title: 'Free for all',
      text: 'Everyone plays on their own computer or phone and scores points for themselves. Quicker, right answers score more. Up to 50 players.',
      drawing: 'A laptop showing a question, with a pet in front of it scoring 820 points.',
    },
    {
      id: 'teams',
      title: 'Team against team',
      text: "Join a god's team in the lobby. Speed doesn't count - your team scores the average of its members' points. Up to 6 teams and 50 players in total.",
      drawing: 'Saradomin and Zamorak side by side, three pets on each, with their team scores.',
    },
    {
      id: 'sofa',
      title: 'On the sofa',
      text: "Join from a big screen and make it the room's TV in the lobby. The TV shows the questions while everyone answers on their phones. Works for both free-for-all and teams, for up to 50 players (or as many as your sofa fits).",
      drawing: 'A TV showing a question, with four pets on a sofa below it, each holding a phone.',
    },
  ]

export type StopId = 'create' | 'choose' | 'invite' | 'ready' | 'splash' | 'answer'

/** A stop's stamp on the trail: an item's icon, an NPC's chathead, or the map's X. */
export type Stamp = { kind: 'item'; id: number } | { kind: 'npc'; id: string } | { kind: 'x' }

export interface NightStop {
  id: StopId
  /** Under its stamp on the trail. */
  label: string
  title: string
  text: string
  /** The stop's drawing, in words for a screen reader. */
  drawing: string
  stamp: Stamp
}

/** How to play's walk through a night, from the first room to the first answer. */
export const NIGHT_STOPS: readonly NightStop[] = [
  {
    id: 'create',
    label: 'Create a room',
    title: 'Create a room',
    text: 'Click Create a room on the home page. As the host, you run the table, and your room stays open for up to 48 hours.',
    drawing: 'The front page, with Create a room picked out.',
    stamp: { kind: 'item', id: 2347 },
  },
  {
    id: 'choose',
    label: 'Modes and settings',
    title: 'Choose your game modes and settings',
    text: 'Pick which hosts will run a round, set the house rules, and choose between free-for-all or teams.',
    drawing: 'Choosing hosts and house rules for the room.',
    stamp: { kind: 'npc', id: 'historian_minas' },
  },
  {
    id: 'invite',
    label: 'Invite friends',
    title: 'Invite your friends and clan members',
    text: 'Share the room code or invite link. Nobody needs an account - players just pick a display name and a pet.',
    drawing: 'The lobby with the room code, a Copy invite link button and pets joining.',
    stamp: { kind: 'npc', id: 'postie_pete' },
  },
  {
    id: 'ready',
    label: 'Ready up',
    title: 'Ready up to start',
    text: 'Everyone flips their Ready switch in the lobby, and the host hits Start when the room is set.',
    drawing: 'The Ready and Not ready yet lists, with the Ready switch on and the Start button.',
    stamp: { kind: 'item', id: 1917 },
  },
  {
    id: 'splash',
    label: 'Splash screen',
    title: 'Read the splash screen, ready up and enjoy',
    text: 'Each round opens with a splash screen introducing the host and the rules. Ready up and the questions begin.',
    drawing: 'A splash screen naming the round and its host, starting in 4.',
    stamp: { kind: 'npc', id: 'ali_morrisane' },
  },
  {
    id: 'answer',
    label: 'Answer',
    title: 'Answer the questions',
    text: 'There are eight question types. Whenever you see a Submit button, make sure to press it before the timer runs out!',
    drawing: '',
    stamp: { kind: 'x' },
  },
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

/** `/api/modes`, fetched once per page for every caller; a failure is tried again next call. */
export function loadModes(): Promise<ModePacing[]> {
  loading ??= getModes().catch((failure: unknown) => {
    loading = null
    throw failure
  })
  return loading
}

/** For tests: forget the list fetched so far. */
export function clearModesCache(): void {
  loading = null
}
