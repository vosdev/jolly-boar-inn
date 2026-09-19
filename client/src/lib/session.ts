/**
 * localStorage: one session token per room, plus the list of rooms created here.
 *
 * Also the home of the admin-token capture (section 7 step 4). `captureAdminToken` runs
 * from `main.ts` before the app is mounted, not from a component's `onMount`: by the
 * time a component's effects run the browser has already painted a frame with the token
 * in the address bar, and anything that navigates or opens a window in between leaks it
 * through the URL. Reading and stripping it before the first render closes that window.
 *
 * Every accessor tolerates localStorage throwing. Safari in private mode and a browser
 * with site data blocked both raise on `getItem`, and a quiz that cannot be played
 * without storage is worse than one that forgets you.
 */

const SESSION_PREFIX = 'jbi:session:'
const CREATED_KEY = 'jbi:created'

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Out of quota, or storage denied. The session lives in memory for this page only.
  }
}

function drop(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    // As above.
  }
}

/** Room codes are uppercase everywhere, so a link typed in lowercase finds its session. */
export function normalizeCode(code: string): string {
  return code.trim().toUpperCase()
}

export function getSession(code: string): string | null {
  return read(SESSION_PREFIX + normalizeCode(code))
}

export function setSession(code: string, session: string): void {
  write(SESSION_PREFIX + normalizeCode(code), session)
}

export function clearSession(code: string): void {
  drop(SESSION_PREFIX + normalizeCode(code))
}

/** The rooms created from this browser, newest first. Section 7 step 3. */
export function createdRooms(): string[] {
  const raw = read(CREATED_KEY)
  if (raw === null) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((c): c is string => typeof c === 'string')
  } catch {
    return []
  }
}

export function rememberCreated(code: string): void {
  const normalized = normalizeCode(code)
  const rooms = [normalized, ...createdRooms().filter((c) => c !== normalized)].slice(0, 20)
  write(CREATED_KEY, JSON.stringify(rooms))
}

// --- The admin token in the URL fragment -------------------------------------------

let pendingToken: string | null = null

/**
 * Take `#t=<token>` out of the address bar and hold it in memory for `AdminClaim`.
 *
 * Call once, from `main.ts`, before mounting. Browsers never send a fragment to a
 * server, so the token cannot reach an access log or a Referer header even before this
 * runs; `replaceState` is about what is left on screen, in the back/forward history and
 * in whatever the user pastes next.
 */
export function captureAdminToken(): void {
  const hash = location.hash.startsWith('#') ? location.hash.slice(1) : location.hash
  if (hash === '') return
  const token = new URLSearchParams(hash).get('t')
  if (token !== null && token !== '') pendingToken = token
  // Strip the whole fragment either way: whatever else is in there, it is not ours.
  history.replaceState(null, '', location.pathname + location.search)
}

/** The captured token, once. A second read returns null, so a claim is never retried. */
export function takeAdminToken(): string | null {
  const token = pendingToken
  pendingToken = null
  return token
}
