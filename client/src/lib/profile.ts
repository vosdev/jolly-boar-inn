/**
 * The profile: the name this browser brings to the next room, under `jbi:profile`.
 *
 * Identity in this app is per-room — a player exists because they joined one, and there
 * is no account. The profile is what makes that bearable: it is local and permanent, so a
 * returning player is never asked their name again, while the server never learns that
 * two players in two rooms were the same person, and has no need to (section 5.1).
 *
 * One object rather than a bare string because D4 adds the head beside the name, and a
 * stored profile from before then should still read.
 *
 * Like `session.ts`, every accessor tolerates localStorage throwing — Safari in private
 * mode, a browser with site data blocked. The store below is the source of truth for the
 * page, and storage is only where it is kept between visits, so a browser that cannot
 * store anything is asked once per visit instead of being unable to play.
 */

import { writable } from 'svelte/store'

import { nameProblem } from './names'

export interface Profile {
  name: string
}

const PROFILE_KEY = 'jbi:profile'

/** What is stored, if it is a profile the server would accept a name from. */
function load(): Profile | null {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(PROFILE_KEY)
  } catch {
    return null
  }
  if (raw === null) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    const name = (parsed as { name?: unknown } | null)?.name
    // A name the rules have since tightened against is no name: better to ask again than
    // to walk somebody into a join the server refuses.
    if (typeof name !== 'string' || nameProblem(name) !== null) return null
    return { name: name.trim() }
  } catch {
    return null
  }
}

/** Null until this browser has a name. The top bar reads "Set your name" until then. */
export const profile = writable<Profile | null>(load())

/** Remember a name, for this page at once and for every visit after it if storage lets us. */
export function saveProfile(name: string): void {
  const next: Profile = { name: name.trim() }
  profile.set(next)
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(next))
  } catch {
    // Out of quota, or storage denied: the name lasts for this page only.
  }
}
