/**
 * The theme this browser paints in, stored under `jbi:theme`.
 *
 * A theme is a block of custom properties in `app.css` selected by `data-theme` on
 * <html>. That is the only way it can work: the CSP is `style-src 'self'` with no
 * 'unsafe-inline', so nothing may write a palette onto an element from JavaScript.
 *
 * The theme is a per-player preference, never a room setting — no protocol message, no
 * server field. A browser that has never chosen gets the selfhoster's
 * `PUBLIC_DEFAULT_THEME`, else `jolly`: nothing here consults `prefers-color-scheme`, so
 * there is one code path to get right before the first paint and a first-time visitor on
 * a dark phone still sees the inn.
 *
 * Storage may throw — Safari in private mode, a browser with site data blocked — and a
 * quiz that cannot be played without storage is worse than one that forgets you, so every
 * accessor tolerates it and the theme simply lasts for the page.
 */

import { defaultTheme } from 'virtual:branding'

/** Every theme `app.css` defines, in menu order. */
export const THEMES = ['jolly', 'pollnivneach', 'wilderness', 'party_room', 'tzhaar'] as const

export type Theme = (typeof THEMES)[number]

/** What the menu calls each theme. */
export const THEME_LABELS: Record<Theme, { name: string }> = {
  jolly: { name: 'Jolly Boar Inn' },
  pollnivneach: { name: 'Pollnivneach' },
  wilderness: { name: 'Wilderness' },
  party_room: { name: 'Party Room' },
  tzhaar: { name: 'TzHaar' },
}

/** `configured` if it names a theme this build paints, else `jolly`, never an unstyled page. */
export function pickDefault(configured: string): Theme {
  return isTheme(configured) ? configured : 'jolly'
}

export const DEFAULT_THEME: Theme = pickDefault(defaultTheme)

const THEME_KEY = 'jbi:theme'

function isTheme(value: string | null): value is Theme {
  return value !== null && (THEMES as readonly string[]).includes(value)
}

/** The stored theme, or the default when there is none, it is unreadable, or it is unknown. */
export function getTheme(): Theme {
  let stored: string | null = null
  try {
    stored = localStorage.getItem(THEME_KEY)
  } catch {
    // Storage denied. The default is as good an answer as any.
  }
  return isTheme(stored) ? stored : DEFAULT_THEME
}

/** Repaint, and remember. Every rule keys off `data-theme`, so this is the whole switch. */
export function setTheme(theme: Theme): void {
  applyTheme(theme)
  try {
    localStorage.setItem(THEME_KEY, theme)
  } catch {
    // Out of quota, or storage denied: the choice lasts for this page only.
  }
}

/** Paint a theme without storing it. */
export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme
}

/**
 * Paint what this browser chose last time. The first thing `main.ts` does.
 *
 * It cannot run any earlier than that: imports are hoisted, so the stylesheet is parsed
 * before any statement of ours, and `script-src 'self'` rules out the inline script that
 * usually fixes this. What saves it is that each theme carries its own `color-scheme`, so
 * the browser paints the right canvas during the gap, and that the gap is one frame.
 */
export function applyStoredTheme(): void {
  applyTheme(getTheme())
}
