/**
 * Pet icons (section 14 of ideas/design.md): the pets a player can be drawn as, and where
 * each one's inventory icon is.
 *
 * `data/pets.json` lists them, `{id, name}` in a fixed order, and `data/assets.json` maps each
 * `pets/<id>.png` to its wiki file. The icons are game assets and not committed, so a file
 * may be missing: found by name at build time, like the NPCs, and dropping one in replaces
 * it on the next build with no code change. A pet with no file is drawn as the player's head.
 */

import PETS_JSON from '../../../data/pets.json'

const petFiles = import.meta.glob<string>('../assets/pets/*.{avif,webp,png,jpg,jpeg,svg}', {
  eager: true,
  query: '?url',
  import: 'default',
})

export interface Pet {
  id: string
  name: string
}

/** Every pet, in the order of `data/pets.json`. */
export const PETS: readonly Pet[] = PETS_JSON

/** What a player is drawn as: their pet's icon, or their head when the pet has no file. */
export type AvatarArt = { kind: 'pet'; url: string; name: string } | { kind: 'head'; head: number }

/** The icon's URL for pet `id`, or null when it has none on disk or is not a pet. */
export function petUrl(id: string, files: Record<string, string> = petFiles): string | null {
  for (const [path, url] of Object.entries(files)) {
    const base = path.slice(path.lastIndexOf('/') + 1)
    if (base.slice(0, base.lastIndexOf('.')) === id) return url
  }
  return null
}

/** The art for a player wearing `pet`, falling back to `head`. */
export function avatarArt(
  pet: string | null,
  head: number,
  files: Record<string, string> = petFiles,
  pets: readonly Pet[] = PETS,
): AvatarArt {
  const found = pet === null ? undefined : pets.find((p) => p.id === pet)
  const url = found === undefined ? null : petUrl(found.id, files)
  return found !== undefined && url !== null ? { kind: 'pet', url, name: found.name } : { kind: 'head', head }
}
