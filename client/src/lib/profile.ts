/**
 * The profile: the name and head this browser brings to the next room, under `jbi:profile`.
 *
 * Identity in this app is per-room — a player exists because they joined one, and there
 * is no account. The profile is what makes that bearable: it is local and permanent, so a
 * returning player is never asked their name again, while the server never learns that
 * two players in two rooms were the same person, and has no need to (section 5.1).
 *
 * The head arrived in D4, beside the name. A profile stored before then has a name and
 * no head, and reads as that name with a fresh random head, kept from then on.
 *
 * Like `session.ts`, every accessor tolerates localStorage throwing — Safari in private
 * mode, a browser with site data blocked. The store below is the source of truth for the
 * page, and storage is only where it is kept between visits, so a browser that cannot
 * store anything gets a fresh random profile per visit instead of being unable to play.
 */

import { writable } from 'svelte/store'

import { isHead, randomHead } from './heads'
import { nameProblem } from './names'

export interface Profile {
  name: string
  head: number
}

const PROFILE_KEY = 'jbi:profile'

function store(profile: Profile): void {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile))
  } catch {
    // Out of quota, or storage denied: the profile lasts for this page only.
  }
}

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
    const parsed = JSON.parse(raw) as { name?: unknown; head?: unknown } | null
    const name = parsed?.name
    // A name the rules have since tightened against is no name: better to ask again than
    // to walk somebody into a join the server refuses.
    if (typeof name !== 'string' || nameProblem(name) !== null) return null
    if (isHead(parsed?.head)) return { name: name.trim(), head: parsed.head }
    // A profile from before heads: give it one now and keep it, so it is the same face
    // on every visit rather than a new one each time the page loads.
    const upgraded = { name: name.trim(), head: randomHead() }
    store(upgraded)
    return upgraded
  } catch {
    return null
  }
}

/** Null until this browser has a name. The top bar reads "Set your name" until then. */
export const profile = writable<Profile | null>(load())

/**
 * Remember a name and a head, for this page at once and for every visit after it if
 * storage lets us. A head left out keeps the one the profile has, or rolls one for a
 * profile that has none yet.
 */
export function saveProfile(name: string, head?: number): void {
  profile.update((current) => {
    const next: Profile = { name: name.trim(), head: head ?? current?.head ?? randomHead() }
    store(next)
    return next
  })
}

/**
 * The room a join-first player landed in under a name they never chose (section 5.1.1,
 * option B), or null. The identity chip nudges them once there — "You're AFKFisher42 —
 * tap to change" — for as long as that room's lobby lasts, or until they tap it or
 * dismiss it. Memory only: a reload is not a second first visit.
 */
export const nudge = writable<string | null>(null)
