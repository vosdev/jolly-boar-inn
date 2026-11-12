/**
 * Client errors and Web Vitals to a Faro receiver, off unless the server wrote its address
 * into `index.html` (`FARO_URL`). Off, the SDK is never fetched.
 *
 * Nothing that names a room or a player leaves the browser: every report loses its query
 * strings and fragments, room paths read `/r/:code`, the codes this browser knows read
 * `:code` wherever they appear, and the tokens it holds read `[token]`.
 */

import { pendingAdminToken, storedAdminToken } from './admin'
import { createdRooms, getSession, normalizeCode } from './session'

/** `FARO_URL_SLOT` in `site-branding.ts`; left as is when Vite serves the page. */
const SLOT = '__FARO_URL__'
const SESSION_PREFIX = 'jbi:session:'
const SERVICE_NAME = 'jolly-boar-inn'

/** What a report must not carry. */
export interface Secrets {
  codes: string[]
  tokens: string[]
}

/** The receiver's address from `index.html`, or null when reporting is off. */
export function faroUrl(doc: Document = document): string | null {
  const url = doc.querySelector<HTMLMetaElement>('meta[name="faro-url"]')?.content ?? ''
  return url === '' || url === SLOT ? null : url
}

function storedKeys(): string[] {
  try {
    return Object.keys(localStorage)
  } catch {
    return []
  }
}

/** The room codes and tokens this browser holds, read at each report since they change. */
export function knownSecrets(path: string = location.pathname): Secrets {
  const sessionCodes = storedKeys()
    .filter((key) => key.startsWith(SESSION_PREFIX))
    .map((key) => key.slice(SESSION_PREFIX.length))
  const inPath = /^\/(?:r|history)\/([^/]+)/.exec(path)?.[1]
  const codes = [...sessionCodes, ...createdRooms(), ...(inPath ? [normalizeCode(inPath)] : [])]
  const tokens = [...sessionCodes.map(getSession), storedAdminToken(), pendingAdminToken()]
  return {
    codes: [...new Set(codes)].filter((code) => /^[A-Z0-9]+$/.test(code)),
    tokens: tokens.filter((token): token is string => token !== null && token.length >= 8),
  }
}

/** One string with every query, fragment, room path, known code and token taken out. */
export function scrubText(text: string, secrets: Secrets): string {
  let out = text
    // Only after an address, so the question mark ending a sentence stays.
    .replace(/(https?:\/\/[^\s?#"'`<>]*|(?<![\w.])\/[\w./:-]*)[?#][^\s"'`<>]*/g, '$1')
    .replace(/\/history\/[^/\s"'`<>]+(\/[^/\s"'`<>]+)?/g, (_, stamp?: string) =>
      stamp ? '/history/:code/:stamp' : '/history/:code',
    )
    .replace(/\/r\/[^/\s"'`<>]+/g, '/r/:code')
  for (const token of secrets.tokens) out = out.split(token).join('[token]')
  for (const code of secrets.codes) out = out.replace(new RegExp(`\\b${code}\\b`, 'gi'), ':code')
  return out
}

/** A copy of a report with `scrubText` applied to every string in it. */
export function scrub<T>(value: T, secrets: Secrets): T {
  if (typeof value === 'string') return scrubText(value, secrets) as T
  if (Array.isArray(value)) return value.map((item: unknown) => scrub(item, secrets)) as T
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, scrub(item, secrets)]),
    ) as T
  }
  return value
}

/** Load the SDK and start reporting, when the server names a receiver. */
export async function startFaro(url: string | null = faroUrl()): Promise<void> {
  if (url === null) return
  const {
    initializeFaro,
    ErrorsInstrumentation,
    SessionInstrumentation,
    WebVitalsInstrumentation,
  } = await import('@grafana/faro-web-sdk')
  initializeFaro({
    url,
    app: { name: SERVICE_NAME, version: __APP_VERSION__ },
    // Named rather than the defaults, which add console capture, user actions and views.
    instrumentations: [
      new ErrorsInstrumentation(),
      new WebVitalsInstrumentation(),
      new SessionInstrumentation(),
    ],
    sessionTracking: { enabled: true, persistent: false },
    trackGeolocation: false,
    beforeSend: (item) => scrub(item, knownSecrets()),
  })
}
