/**
 * Emotes at the table: the emote tab's eight, the words each pet says, and which one
 * each pet is playing right now.
 *
 * The server picks which of an emote's two lines shows, so every screen says the same; the
 * words live here. An emote is never stored or replayed: a reload shows none.
 */

import { writable } from 'svelte/store'

import type { EmoteSent, OpenQuestion, PlayerView, RoomView } from './protocol'

export type EmoteId = EmoteSent['emote']
/** The game's chat colours the lines use; `glow` cycles through them, as `glow1:` does. */
export type ChatColour = 'yellow' | 'white' | 'cyan' | 'red' | 'glow'
/** The game's chat effects: `wave` ripples the letters, `shake` jitters them, `sinks` drops them. */
export type ChatEffect = 'wave' | 'shake' | 'sinks' | null
/** What the chathead does, in CSS transforms. */
export type Motion = 'rock' | 'bounce' | 'pulse' | 'hop' | 'tilt' | 'jitter' | 'droop' | 'jolt'

export interface Emote {
  id: EmoteId
  name: string
  lines: readonly [string, string]
  colour: ChatColour
  effect: ChatEffect
  motion: Motion
}

/** The tab's order, row by row. */
export const EMOTES: readonly Emote[] = [
  {
    id: 'wave',
    name: 'Wave',
    lines: ['Hi all!', 'Hey!'],
    colour: 'yellow',
    effect: 'wave',
    motion: 'rock',
  },
  {
    id: 'cheer',
    name: 'Cheer',
    lines: ['Gz!', 'Woo!'],
    colour: 'yellow',
    effect: 'wave',
    motion: 'bounce',
  },
  {
    id: 'clap',
    name: 'Clap',
    lines: ['Nice one!', 'Gg!'],
    colour: 'glow',
    effect: null,
    motion: 'pulse',
  },
  {
    id: 'laugh',
    name: 'Laugh',
    lines: ['Hahaha!', 'Lol!'],
    colour: 'yellow',
    effect: null,
    motion: 'hop',
  },
  {
    id: 'think',
    name: 'Think',
    lines: ['Hmm...', 'Uhh...'],
    colour: 'white',
    effect: null,
    motion: 'tilt',
  },
  {
    id: 'panic',
    name: 'Panic',
    lines: ['Panic!', 'Please!'],
    colour: 'yellow',
    effect: 'shake',
    motion: 'jitter',
  },
  {
    id: 'cry',
    name: 'Cry',
    lines: ['Nooo...', 'Why...'],
    colour: 'cyan',
    effect: 'sinks',
    motion: 'droop',
  },
  {
    id: 'angry',
    name: 'Angry',
    lines: ['Rigged!', 'Grrr!'],
    colour: 'red',
    effect: 'shake',
    motion: 'jolt',
  },
]

/** How long a line stays over a pet, and how long the sender waits for the next: the server's 3 s. */
export const EMOTE_MS = 3000

export function emoteOf(id: string): Emote | undefined {
  return EMOTES.find((emote) => emote.id === id)
}

// An empty folder is an empty object, so an emote with no icon is known to have none before
// the page asks, and nothing ever 404s.
const iconFiles = import.meta.glob<string>('../assets/emotes/*.{avif,webp,png,jpg,jpeg,svg}', {
  eager: true,
  query: '?url',
  import: 'default',
})

/** The wiki's icon for `id`, or the Emotes button's for `button`; null when `make fetch-assets` has not brought it. */
export function emoteIcon(
  id: EmoteId | 'button',
  files: Record<string, string> = iconFiles,
): string | null {
  for (const [path, url] of Object.entries(files)) {
    const base = path.slice(path.lastIndexOf('/') + 1)
    if (base.slice(0, base.lastIndexOf('.')) === id) return url
  }
  return null
}

/**
 * Whether `you` may send an emote now, as the server decides it: in the lobby, a reveal, the
 * standings between rounds, or an open question they have answered or cannot answer. Never the
 * TV, a daily room, the splash or the final.
 */
export function canEmote(
  room: RoomView | null,
  you: PlayerView | null,
  question: OpenQuestion | null,
  answered: boolean,
): boolean {
  if (room === null || you === null || you.role === 'tv' || room.daily != null) return false
  if (room.status === 'lobby') return true
  if (room.status !== 'playing') return false
  if (room.phase === 'reveal' || room.phase === 'standings') return true
  if (room.phase !== 'open' || question === null) return false
  return answered || !question.you_can_answer
}

export interface Shown {
  emote: Emote
  line: string
  /** Counts up with every emote, so the same one again restarts its motion. */
  key: number
}

/** The emote each pet is playing, by player id; one leaves `EMOTE_MS` after it came. */
export const shownEmotes = writable<ReadonlyMap<string, Shown>>(new Map())
/** When this client's own last emote landed, on `Date.now()`; null until one does. */
export const yourEmoteAt = writable<number | null>(null)

let shownCount = 0
const timers = new Map<string, ReturnType<typeof setTimeout>>()

/** Show an `emote` frame over its pet, replacing what that pet was saying. */
export function noteEmote(
  message: EmoteSent,
  youId: string | null,
  now: number = Date.now(),
): void {
  const emote = emoteOf(message.emote)
  if (emote === undefined) return
  const key = ++shownCount
  const shown: Shown = { emote, line: emote.lines[message.line === 1 ? 1 : 0], key }
  shownEmotes.update((current) => new Map(current).set(message.player_id, shown))
  if (message.player_id === youId) yourEmoteAt.set(now)
  clearTimeout(timers.get(message.player_id))
  timers.set(
    message.player_id,
    setTimeout(() => {
      timers.delete(message.player_id)
      shownEmotes.update((current) => {
        if (current.get(message.player_id)?.key !== key) return current
        const next = new Map(current)
        next.delete(message.player_id)
        return next
      })
    }, EMOTE_MS),
  )
}

/** Forget every emote: leaving the room, or a `welcome`, which replays none. */
export function clearEmotes(): void {
  for (const timer of timers.values()) clearTimeout(timer)
  timers.clear()
  shownEmotes.set(new Map())
  yourEmoteAt.set(null)
}
