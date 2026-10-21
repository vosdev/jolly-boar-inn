/**
 * Pets (sections 6 and 14 of ideas/design.md): the pets a player can be, which one they
 * wear, and the two pictures each has, its wiki chathead and its inventory icon.
 *
 * `data/pets.json` lists them, `{id, name}`, and `data/assets.json` maps
 * `pets/<id>_chathead.png` and `pets/<id>.png` to their wiki files. A pet is pickable when
 * both are in the manifest, and the server holds the same rule (`app/pets.py`), so a
 * browser and the room agree on the list without asking for it. `players.avatar` stores
 * the pet's id, so it travels to everybody else in the room.
 *
 * The server stores a pet for every player, one it picks when the client sends none, so
 * every browser draws the same pet and it never moves when the pickable list grows. An id
 * this build does not offer is drawn as the boar rather than leaving a gap.
 *
 * The files are game assets and not committed, so one may be missing: found by name at
 * build time, like the NPCs, and dropping one in replaces it on the next build with no code
 * change. A pet with neither file is drawn as the boar.
 */

import ASSETS_JSON from '../../../data/assets.json'
import PETS_JSON from '../../../data/pets.json'
import { FALLBACK_NPC, npcArt } from './npcs'

const petFiles = import.meta.glob<string>('../assets/pets/*.{avif,webp,png,jpg,jpeg,svg}', {
  eager: true,
  query: '?url',
  import: 'default',
})

export interface Pet {
  id: string
  name: string
}

/** Every pet in `data/pets.json`, whether or not it can be picked yet. */
export const PETS: readonly Pet[] = PETS_JSON

/** The pets with both pictures in the manifest, A to Z: the picker's list. */
export function pickablePets(pets: readonly Pet[] = PETS, manifest: object = ASSETS_JSON): Pet[] {
  return pets
    .filter((pet) => `pets/${pet.id}.png` in manifest && `pets/${pet.id}_chathead.png` in manifest)
    .sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }))
}

/** What a player can pick, in the order the picker lists it. */
export const PICKABLE: readonly Pet[] = pickablePets()

const NAMES = new Map(PICKABLE.map((pet) => [pet.id, pet.name]))

/** Which picture a player is drawn as: the big chathead, or the small inventory icon. */
export type PetCut = 'chathead' | 'icon'

/** A picture to draw; `cut` is `fallback` for the boar standing in for a pet with no file. */
export interface AvatarArt {
  url: string
  cut: PetCut | 'fallback'
}

/** The pet's name, for a screen reader and the picker: "Aggy", "Baby Mole". */
export function petName(pet: string): string {
  return NAMES.get(pet) ?? 'Pet'
}

/** Whether `pet` is one this build offers, for an id read back from storage or a server. */
export function isPet(pet: unknown): pet is string {
  return typeof pet === 'string' && NAMES.has(pet)
}

/**
 * The pet to draw for a player or a standing: their own. The server stores one for every
 * player, so an empty string is only an id this build does not offer, drawn as the boar.
 */
export function petOf(player: { id: string; avatar?: string | null }): string {
  return isPet(player.avatar) ? player.avatar : ''
}

/**
 * A random pet, other than `previous` and, when there is one left, other than every pet in
 * `taken` — the ones already in the room, so a pick tends toward one nobody else is
 * wearing. Past that, repeats are allowed rather than the button doing nothing.
 */
export function randomPet(
  taken: Iterable<string> = [],
  previous: string | null = null,
  pets: readonly Pet[] = PICKABLE,
): string {
  const avoid = new Set(taken)
  if (previous !== null) avoid.add(previous)
  const free = pets.filter((pet) => !avoid.has(pet.id))
  const pool = free.length > 0 ? free : pets.filter((pet) => pet.id !== previous)
  return pool[Math.floor(Math.random() * pool.length)]?.id ?? ''
}

/** The file whose name without its extension is `stem`, or null. */
function fileNamed(files: Record<string, string>, stem: string): string | null {
  for (const [path, url] of Object.entries(files)) {
    const base = path.slice(path.lastIndexOf('/') + 1)
    if (base.slice(0, base.lastIndexOf('.')) === stem) return url
  }
  return null
}

/** The art for a player wearing `pet`: the `prefer`red picture, else the other, else the boar. */
export function avatarArt(
  pet: string,
  prefer: PetCut = 'chathead',
  files: Record<string, string> = petFiles,
): AvatarArt {
  const order: PetCut[] = prefer === 'chathead' ? ['chathead', 'icon'] : ['icon', 'chathead']
  for (const cut of order) {
    const url = fileNamed(files, cut === 'chathead' ? `${pet}_chathead` : pet)
    if (url !== null) return { url, cut }
  }
  return { url: npcArt(FALLBACK_NPC).url, cut: 'fallback' }
}
