import { writable } from 'svelte/store'

import type { PlayerView } from './protocol'

/**
 * Whether this browser shows a question's answers alone: the room has a TV connected to
 * show the rest, and this is not it. A TV that drops gives the phones the whole question
 * back until it returns, so a game never waits on a dead screen.
 */
export function answersOnly(players: PlayerView[], you: PlayerView | null): boolean {
  if (you?.role === 'tv') return false
  return players.some((player) => player.role === 'tv' && player.connected)
}

/**
 * What a TV's stage has beside its scroll: the panel of who is still to answer, or the
 * same panel widened into the reveal.
 */
export type TvPanel = 'waiting' | 'reveal'

/**
 * How long before a reveal ends the TV's panel starts closing it: the reveal fades off
 * (200 ms), the panel narrows back to the waiting panel's width (250 ms) and the stage
 * scales to its new size (250 ms), so the next screen, a random event's entrance among
 * them, starts from a stage at rest.
 */
export const TV_CLOSE_MS = 700

/** The share of the window the TV's stage fills, along whichever side it reaches first. */
export const TV_SHARE = 0.8

/** How a TV's stage is drawn now: its scale, and its width on screen in px. */
export const tvFit = writable<{ scale: number; width: number } | null>(null)

/**
 * How much to scale a stage `natural` px in size so it fills `share` of `view`: as large
 * as fits both ways, so the side it touches first is exactly `share` of the window's.
 */
export function fitScale(
  natural: { width: number; height: number },
  view: { width: number; height: number },
  share = TV_SHARE,
): number {
  if (natural.width <= 0 || natural.height <= 0) return 1
  return Math.min((share * view.width) / natural.width, (share * view.height) / natural.height)
}
