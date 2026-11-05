/**
 * Reload onto the server's build after a deploy.
 *
 * A tab keeps the bundle it loaded, which would talk to the new server with the old code.
 * The Room's `welcome` names the server's version and reloads at once: the rejoin's
 * `welcome` restores `your_answer`, so mid-question is fine. Every API response names it
 * too (`X-App-Version`), and a tab on any other screen waits for the next navigation or for
 * the player to come back to it, so a half-filled form is never wiped.
 *
 * At most once per server version: sessionStorage remembers the version a reload was for,
 * so a cache still serving the old bundle cannot loop the page.
 */

const RELOADED_KEY = 'jbi:reloaded-for'
// Its own note, so a chunk reload and a version reload never undo each other's guard.
const CHUNK_RELOADED_KEY = 'jbi:reloaded-for-chunk'

let newer: string | null = null

function reloadOnce(key: string, note: string, reload: () => void): boolean {
  try {
    if (sessionStorage.getItem(key) === note) return false
    sessionStorage.setItem(key, note)
  } catch {
    // Without the note there is no telling whether this page is the reload already.
    return false
  }
  reload()
  return true
}

/** Reload the page if this build is not `serverVersion`'s. `true` if it is reloading. */
export function reloadIfStale(
  serverVersion: string | null | undefined,
  reload: () => void = () => location.reload(),
): boolean {
  if (serverVersion == null || serverVersion === __APP_VERSION__) return false
  return reloadOnce(RELOADED_KEY, serverVersion, reload)
}

/** Remember the version an API response named, for `reloadIfNewer` to act on. */
export function noteServerVersion(serverVersion: string | null): void {
  if (serverVersion !== null && serverVersion !== __APP_VERSION__) newer = serverVersion
}

/** Reload if an API response named another version. `true` if it is reloading. */
export function reloadIfNewer(reload: () => void = () => location.reload()): boolean {
  return reloadIfStale(newer, reload)
}

/**
 * Reload when this build's lazily loaded files are gone, once per build.
 *
 * A deploy replaces the old build's chunks, so an old tab opening the map finds nothing.
 * Waiting would leave the screen broken, so this reloads at once.
 */
export function reloadForMissingChunk(reload: () => void = () => location.reload()): boolean {
  return reloadOnce(CHUNK_RELOADED_KEY, __APP_VERSION__, reload)
}

/** Reload onto a newer version when the tab comes back, and when a chunk is missing. */
export function listenForNewVersion(): void {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') reloadIfNewer()
  })
  addEventListener('vite:preloadError', (event) => {
    if (reloadForMissingChunk()) event.preventDefault()
  })
}

/** Forget a remembered version; for tests. */
export function resetNewerVersion(): void {
  newer = null
}
