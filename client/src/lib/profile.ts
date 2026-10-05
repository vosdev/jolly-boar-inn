/**
 * The profile: the name and pet this browser brings to the next room, under `jbi:profile`.
 *
 * Identity in this app is per-room — a player exists because they joined one, and there
 * is no account. The profile is what makes that bearable: it is local and permanent, so a
 * returning player is never asked their name again, while the server never learns that
 * two players in two rooms were the same person, and has no need to (section 5.1).
 *
 * The pet arrived after the name. A profile stored before it, or with a pet this build
 * does not offer, reads as that name with a fresh random pet, kept from then on.
 *
 * Like `session.ts`, every accessor tolerates localStorage throwing — Safari in private
 * mode, a browser with site data blocked. The store below is the source of truth for the
 * page, and storage is only where it is kept between visits, so a browser that cannot
 * store anything gets a fresh random profile per visit instead of being unable to play.
 */

import { writable } from 'svelte/store'

import { nameProblem, normalizeName } from './names'
import { isPet, randomPet } from './pets'

export interface Profile {
  name: string
  pet: string
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
    const parsed = JSON.parse(raw) as { name?: unknown; pet?: unknown } | null
    const name = parsed?.name
    // A name the rules have since tightened against is no name: better to ask again than
    // to walk somebody into a join the server refuses.
    if (typeof name !== 'string' || nameProblem(name) !== null) return null
    if (isPet(parsed?.pet)) return { name: normalizeName(name), pet: parsed.pet }
    // A profile with no pet to wear: give it one now and keep it, so it is the same pet
    // on every visit rather than a new one each time the page loads.
    const upgraded = { name: normalizeName(name), pet: randomPet() }
    store(upgraded)
    return upgraded
  } catch {
    return null
  }
}

/**
 * Whether this browser had a profile before this page loaded: the server counts returning
 * players by it, and stores it nowhere. Read once, so naming yourself on this visit and
 * then creating a room is still a first visit.
 */
export const returningVisitor: boolean = (() => {
  try {
    return localStorage.getItem(PROFILE_KEY) !== null
  } catch {
    return false
  }
})()

/** Null until this browser has a name. The top bar reads "Set your name" until then. */
export const profile = writable<Profile | null>(load())

/**
 * Remember a name and a pet, for this page at once and for every visit after it if
 * storage lets us. A pet left out keeps the one the profile has, or rolls one for a
 * profile that has none yet.
 */
export function saveProfile(name: string, pet?: string): void {
  profile.update((current) => {
    const next: Profile = { name: normalizeName(name), pet: pet ?? current?.pet ?? randomPet() }
    store(next)
    return next
  })
}
