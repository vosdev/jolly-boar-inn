/**
 * localStorage: one session token per room, plus the list of rooms created here.
 *
 * Every accessor tolerates localStorage throwing. Safari in private mode and a browser
 * with site data blocked both raise on `getItem`, and a quiz that cannot be played
 * without storage is worse than one that forgets you.
 */

const SESSION_PREFIX = 'jbi:session:'
const CREATED_KEY = 'jbi:created'

/** What storage would not take, so a browser that stores nothing keeps it for the page. */
const unstored = new Map<string, string>()

function read(key: string): string | null {
  try {
    return localStorage.getItem(key) ?? unstored.get(key) ?? null
  } catch {
    return unstored.get(key) ?? null
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
    unstored.delete(key)
  } catch {
    // Out of quota, or storage denied.
    unstored.set(key, value)
  }
}

function drop(key: string): void {
  unstored.delete(key)
  try {
    localStorage.removeItem(key)
  } catch {
    // As above.
  }
}

/**
 * A code as the server spells it. Codes are joined-up words that get read out as two, so
 * "Abyssal bludgeon", "abyssal-bludgeon" and "Ahrim's Staff" all have to find their room.
 */
export function normalizeCode(code: string): string {
  return code.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
}

/** Whether a normalized code is one the router can route to. */
export function isRoomCode(code: string): boolean {
  return /^[A-Z0-9]{1,32}$/.test(code)
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

interface CreatedRoom {
  code: string
  expiresAt: number
}

/**
 * A stored entry as a room and its expiry, or null if there is nothing to go on. Entries
 * from before the list kept expiries are bare codes with no time at all, so they go.
 */
function entryOf(raw: unknown): CreatedRoom | null {
  if (typeof raw !== 'object' || raw === null) return null
  const { code, expires_at } = raw as Record<string, unknown>
  if (typeof code !== 'string' || typeof expires_at !== 'string') return null
  const expiresAt = Date.parse(expires_at)
  return Number.isNaN(expiresAt) ? null : { code, expiresAt }
}

function readCreated(now: number): CreatedRoom[] {
  const raw = read(CREATED_KEY)
  if (raw === null) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map(entryOf)
      .filter((entry): entry is CreatedRoom => entry !== null && entry.expiresAt > now)
  } catch {
    return []
  }
}

function writeCreated(rooms: CreatedRoom[]): void {
  const stored = rooms.map((room) => ({
    code: room.code,
    expires_at: new Date(room.expiresAt).toISOString(),
  }))
  write(CREATED_KEY, JSON.stringify(stored))
}

/**
 * The codes of the rooms created from this browser that have not expired, newest first.
 * Codes are reused once a room is gone, so an expired entry would open somebody else's.
 */
export function createdRooms(now: number = Date.now()): string[] {
  return readCreated(now).map((room) => room.code)
}

/** Drop a room from the created list and forget its session; used after deleting it. */
export function forgetCreated(code: string): void {
  const normalized = normalizeCode(code)
  writeCreated(readCreated(Date.now()).filter((room) => room.code !== normalized))
  clearSession(normalized)
}

/** Put a room at the top of the created list until `expiresAt`, the server's ISO time. */
export function rememberCreated(code: string, expiresAt: string): void {
  const normalized = normalizeCode(code)
  const expiry = Date.parse(expiresAt)
  const rest = readCreated(Date.now()).filter((room) => room.code !== normalized)
  const rooms = Number.isNaN(expiry) ? rest : [{ code: normalized, expiresAt: expiry }, ...rest]
  writeCreated(rooms.slice(0, 20))
}
