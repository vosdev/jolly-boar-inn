/**
 * When the price modes' prices were fetched, per mode, from `GET /api/modes`. The footer and
 * a price round's splash say it once, so no question has to.
 *
 * Fetched once per page load and kept: the date changes only when the server is redeployed
 * with a new pack. A failed fetch leaves it empty, and the date is simply not shown.
 */

import { loadModes } from './howToPlay'

export const pricesAsOf = $state<{ byMode: Record<string, string> }>({ byMode: {} })

let loading: Promise<void> | null = null

/** Fetch the dates unless this page already has; safe to call from every screen that shows one. */
export function loadPricesAsOf(): Promise<void> {
  loading ??= loadModes().then(
    (modes) => {
      pricesAsOf.byMode = Object.fromEntries(
        modes.flatMap((mode) => (mode.as_of === null ? [] : [[mode.id, mode.as_of]])),
      )
    },
    () => {
      loading = null
    },
  )
  return loading
}

/** The newest date across the modes, for the footer; null before the fetch or without one. */
export function newestAsOf(byMode: Record<string, string>): string | null {
  const dates = Object.values(byMode).sort()
  return dates.at(-1) ?? null
}
