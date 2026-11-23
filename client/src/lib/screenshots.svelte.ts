/**
 * The file each pack screenshot is served as, for drawing a question whole in `/admin`. A pack
 * question names its screenshot by asset id; only the server knows the random file it became.
 *
 * Fetched once per page load. A failed fetch leaves it empty: the questions show without photos.
 */

import { getScreenshots } from './admin'

export const screenshots = $state<{ files: Record<string, string> }>({ files: {} })

let loading: Promise<void> | null = null

/** Fetch the files unless this page already has; safe to call from every admin tab. */
export function loadScreenshots(token: string): Promise<void> {
  loading ??= getScreenshots(token).then(
    (files) => {
      screenshots.files = files
    },
    () => {
      loading = null
    },
  )
  return loading
}

/** The file of a pack question's screenshot, or null without one this build has. */
export function screenshotFile(payload: Record<string, unknown>): string | null {
  const asset = payload.screenshot
  return typeof asset === 'string' ? (screenshots.files[asset] ?? null) : null
}
