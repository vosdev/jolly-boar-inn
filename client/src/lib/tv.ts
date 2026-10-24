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

/**
 * The TV sheet's text, as `--scroll-text`: about 56px on a 1080p screen, and at the least
 * about 44px, below which a sheet too full for the window grows taller and smaller instead.
 */
export const TV_TEXT = 1.6
export const TV_TEXT_LEAST = 1.25

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

/** The most hiscores rows the TV's sheet shows at once; the rest it scrolls to, slowly. */
export const TV_ROWS = 12

/** How the TV's long hiscores move: px a second on the unscaled stage, and the pauses. */
export const CRAWL = { speed: 40, hold: 4000 }

/**
 * The height to clip a table to so it shows `rows` rows from `top`, given each row's
 * bottom edge, or null when every row fits.
 */
export function crawlHeight(top: number, bottoms: number[], rows = TV_ROWS): number | null {
  const last = bottoms[rows - 1]
  if (bottoms.length <= rows || last === undefined) return null
  return Math.ceil(last - top)
}

/**
 * Show a long table on the TV a screen at a time: clipped to `TV_ROWS` rows, then scrolled
 * to its foot, held there and back to its top, over and over. Under reduced motion it is
 * left whole, and the stage shrinks to fit it.
 */
export function crawl(
  node: HTMLElement,
  on: boolean,
): { update(on: boolean): void; destroy(): void } {
  let frame = 0
  let timer: ReturnType<typeof setTimeout> | undefined

  function stop(): void {
    cancelAnimationFrame(frame)
    clearTimeout(timer)
    node.style.removeProperty('max-height')
    node.style.removeProperty('overflow')
    node.scrollTop = 0
  }

  function start(): void {
    stop()
    if (!on || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const top = node.getBoundingClientRect().top
    const bottoms = [...node.querySelectorAll('tbody tr')].map(
      (row) => row.getBoundingClientRect().bottom,
    )
    // Measured on the scaled stage, so back to its own px.
    const scale = node.getBoundingClientRect().height / (node.offsetHeight || 1)
    const height = crawlHeight(top, bottoms)
    if (height === null) return
    node.style.maxHeight = `${height / (scale || 1)}px`
    node.style.overflow = 'hidden'
    const down = (): void => {
      const from = performance.now()
      const step = (now: number): void => {
        node.scrollTop = ((now - from) / 1000) * CRAWL.speed
        if (node.scrollTop + node.clientHeight < node.scrollHeight - 1) {
          frame = requestAnimationFrame(step)
        } else {
          timer = setTimeout(() => {
            node.scrollTop = 0
            timer = setTimeout(down, CRAWL.hold)
          }, CRAWL.hold)
        }
      }
      frame = requestAnimationFrame(step)
    }
    timer = setTimeout(down, CRAWL.hold)
  }

  start()
  return {
    update(now: boolean) {
      on = now
      start()
    },
    destroy: stop,
  }
}
