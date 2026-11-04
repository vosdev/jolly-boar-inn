/**
 * Sound (section 7 of ideas/design.md): the two switches, which screen plays, and playback.
 *
 * *Music & effects* is decoration; *Question audio* is the question itself, so it is a
 * switch of its own that can warn about being off. Both are stored under `jbi:sound`, and
 * like the theme they tolerate storage that throws by lasting for the page.
 *
 * A room with a TV connected wants one loudspeaker, not a phone per player talking over
 * it: the TV plays everything and the phones nothing. A player may still turn a switch
 * back on, say to hear a stream's TV room on their phone; that choice is the room's, not
 * the browser's, and leaving the room forgets it.
 *
 * No sound file ships yet, so `EFFECTS` is empty and every effect is silent. A file
 * dropped into `assets/sounds/` named after its effect plays with no code change.
 */

import { derived, get, writable, type Readable } from 'svelte/store'

import type { PlayerView } from './protocol'
import { players, room, you } from './stores'

export interface SoundSettings {
  effects: boolean
  question: boolean
}

export type SoundSwitch = keyof SoundSettings

/** The moments an effect can mark. */
export type Effect =
  'splash' | 'countdown' | 'open' | 'right' | 'wrong' | 'reveal' | 'final' | 'event'

/** How a screen's sound is decided: its own settings, a room's TV rule, or being the TV. */
export type SoundSource = 'stored' | 'tv_room' | 'tv'

const SOUND_KEY = 'jbi:sound'
const DEFAULTS: SoundSettings = { effects: true, question: true }

const EFFECTS: Record<string, string> = import.meta.glob<string>('../assets/sounds/*.mp3', {
  eager: true,
  query: '?url',
  import: 'default',
})

/** The settings this browser stored, with the defaults for anything missing or unreadable. */
export function storedSound(): SoundSettings {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(SOUND_KEY) ?? 'null')
    if (typeof parsed === 'object' && parsed !== null) {
      const { effects, question } = parsed as Partial<Record<SoundSwitch, unknown>>
      return {
        effects: typeof effects === 'boolean' ? effects : DEFAULTS.effects,
        question: typeof question === 'boolean' ? question : DEFAULTS.question,
      }
    }
  } catch {
    // Storage denied or the value mangled: the defaults will do.
  }
  return { ...DEFAULTS }
}

/** This browser's own settings, as stored. */
const storedSettings = writable<SoundSettings>(storedSound())

function store(settings: SoundSettings): void {
  storedSettings.set(settings)
  try {
    localStorage.setItem(SOUND_KEY, JSON.stringify(settings))
  } catch {
    // Out of quota, or storage denied: the settings last for this page only.
  }
}

/** A player's own switches in a TV room, for that room alone. */
const roomChoice = writable<Partial<SoundSettings>>({})

room.subscribe((current) => {
  if (current === null) roomChoice.set({})
})

/** Which rule decides this screen's sound, from who is in the room and who you are. */
export function soundSource(list: PlayerView[], self: PlayerView | null): SoundSource {
  if (self === null) return 'stored'
  if (self.role === 'tv') return 'tv'
  return list.some((player) => player.role === 'tv' && player.connected) ? 'tv_room' : 'stored'
}

/** The switches as they are now: the TV's forced on, a TV room's off but for the player's own choice. */
export function effectiveSound(
  source: SoundSource,
  stored: SoundSettings,
  choice: Partial<SoundSettings>,
): SoundSettings {
  if (source === 'tv') return { effects: true, question: true }
  if (source === 'tv_room') {
    return { effects: choice.effects ?? false, question: choice.question ?? false }
  }
  return stored
}

export const source: Readable<SoundSource> = derived([players, you], ([$players, $you]) =>
  soundSource($players, $you),
)

export const sound: Readable<SoundSettings> = derived(
  [source, storedSettings, roomChoice],
  ([$source, $stored, $choice]) => effectiveSound($source, $stored, $choice),
)

/** Flip a switch where it belongs: the stored settings, or a TV room's choice. The TV's are fixed. */
export function toggleSound(which: SoundSwitch): void {
  const now = get(source)
  if (now === 'tv') return
  const on = !get(sound)[which]
  if (now === 'tv_room') roomChoice.update((choice) => ({ ...choice, [which]: on }))
  else store({ ...get(storedSettings), [which]: on })
}

/**
 * Whether the browser lets this page play sound: after a gesture, which a page that was
 * tapped before it became the TV already has. A reload starts it over.
 */
export const unlocked = writable(
  typeof navigator !== 'undefined' && navigator.userActivation?.hasBeenActive === true,
)

let context: AudioContext | null = null

/** The page's `AudioContext` once unlocked, made on first use: a page unlocked from the
 * start never sees the gesture `unlock` would have made it in. */
export function audioContext(): AudioContext | null {
  if (!get(unlocked) || typeof AudioContext === 'undefined') return null
  context ??= new AudioContext()
  return context
}

function unlock(): void {
  unlocked.set(true)
  void audioContext()
    ?.resume()
    .catch(() => {})
  removeEventListener('pointerdown', unlock, true)
  removeEventListener('keydown', unlock, true)
}

/**
 * Unlock audio on the first tap or key press anywhere, so whatever a player touches first,
 * the ready switch or an answer after a reload, counts. Capturing, so a handler that stops
 * the event cannot keep it from us.
 */
export function listenForUnlock(): void {
  if (get(unlocked)) return
  addEventListener('pointerdown', unlock, true)
  addEventListener('keydown', unlock, true)
}

const buffers = new Map<string, Promise<AudioBuffer | null>>()

function buffer(url: string, ctx: AudioContext): Promise<AudioBuffer | null> {
  let loaded = buffers.get(url)
  if (loaded === undefined) {
    loaded = fetch(url)
      .then((response) => response.arrayBuffer())
      .then((data) => ctx.decodeAudioData(data))
      .catch(() => null)
    buffers.set(url, loaded)
  }
  return loaded
}

/** Play an effect once, if Music & effects is on, the page is unlocked and the effect has a file. */
export function playEffect(effect: Effect): void {
  const url = EFFECTS[`../assets/sounds/${effect}.mp3`]
  if (url === undefined || !get(sound).effects) return
  const ctx = audioContext()
  if (ctx === null) return
  void buffer(url, ctx).then((decoded) => {
    if (decoded === null) return
    const node = ctx.createBufferSource()
    node.buffer = decoded
    node.connect(ctx.destination)
    node.start()
  })
}

/** Why question audio cannot play here, or null if it can. */
export function questionAudioBlocked(): 'muted' | 'locked' | null {
  if (!get(sound).question) return 'muted'
  return get(unlocked) ? null : 'locked'
}
