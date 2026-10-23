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
 * How long before a reveal ends the TV's panel fades it off, so the next screen, a random
 * event's entrance among them, starts from an empty panel at rest.
 */
export const TV_CLOSE_MS = 200

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

/**
 * The least height for a TV's stage `width` px wide: the window's own shape, so scaled to
 * fit it fills the window's share both ways, and a screen's words, however few, never
 * change its scale. Words that need more make it taller, and smaller.
 */
export function tvMinHeight(width: number, view: { width: number; height: number }): number {
  return view.width > 0 ? (width * view.height) / view.width : 0
}
