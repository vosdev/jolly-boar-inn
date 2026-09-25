/**
 * Reload onto the server's build after a deploy.
 *
 * A deploy closes every socket with 1012 and the reconnect brings each tab back on the
 * bundle it already had, which would read the new server's frames with the old code. The
 * `welcome` names the server's version, and a tab built from another one reloads.
 *
 * At most once per server version: sessionStorage remembers the version a reload was for,
 * so a cache still serving the old bundle cannot loop the page. Mid-question is fine: the
 * rejoin's `welcome` restores `your_answer`.
 */

const RELOADED_KEY = 'jbi:reloaded-for'

/** Reload the page if this build is not `serverVersion`'s. `true` if it is reloading. */
export function reloadIfStale(
  serverVersion: string | undefined,
  reload: () => void = () => location.reload(),
): boolean {
  if (serverVersion === undefined || serverVersion === __APP_VERSION__) return false
  try {
    if (sessionStorage.getItem(RELOADED_KEY) === serverVersion) return false
    sessionStorage.setItem(RELOADED_KEY, serverVersion)
  } catch {
    // Without the note there is no telling whether this page is the reload already.
    return false
  }
  reload()
  return true
}
