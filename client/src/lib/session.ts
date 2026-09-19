/**
 * localStorage: one session token per room, plus the list of rooms created here.
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
