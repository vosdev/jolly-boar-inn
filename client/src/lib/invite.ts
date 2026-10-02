/**
 * Invite links: `/r/CODE#k=KEY`. The key rides in the fragment, which a browser never
 * sends, so no access log or `Referer` sees it; Join moves it into the join body.
 */

const KEY = /^[A-Za-z0-9_-]{1,200}$/

/** The key in a fragment such as `#k=…`, or null. */
export function keyFromHash(hash: string): string | null {
  const key = new URLSearchParams(hash.replace(/^#/, '')).get('k')
  return key !== null && KEY.test(key) ? key : null
}

/** The link players join by, carrying `key` when the room has one. */
export function inviteLink(origin: string, code: string, key?: string): string {
  const link = `${origin}/r/${code}`
  return key === undefined ? link : `${link}#k=${key}`
}

/** The same link as a shared screen may show it: the key as asterisks. */
export function maskedLink(origin: string, code: string, key?: string): string {
  return inviteLink(origin, code, key === undefined ? undefined : '*'.repeat(key.length))
}
