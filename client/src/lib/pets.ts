/**
 * Pet art (section 14 of ideas/design.md): the pets a player can be drawn as, and the two
 * pictures each may have, its wiki chathead and its inventory icon.
 *
 * `data/pets.json` lists them, `{id, name}` in a fixed order, and `data/assets.json` maps
 * `pets/<id>_chathead.png` and `pets/<id>.png` to their wiki files. A pet has at least one;
 * most have both. The files are game assets and not committed, so one may be missing: found
 * by name at build time, like the NPCs, and dropping one in replaces it on the next build
 * with no code change. A pet with neither file is drawn as the player's head.
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

/** Which picture a player is drawn as: the big chathead, or the small inventory icon. */
export type PetCut = 'chathead' | 'icon'

/** What a player is drawn as: their pet's picture, or their head when the pet has none. */
export type AvatarArt = { kind: 'pet'; url: string; name: string; cut: PetCut } | { kind: 'head'; head: number }

/** The file whose name without its extension is `stem`, or null. */
function fileNamed(files: Record<string, string>, stem: string): string | null {
  for (const [path, url] of Object.entries(files)) {
    const base = path.slice(path.lastIndexOf('/') + 1)
    if (base.slice(0, base.lastIndexOf('.')) === stem) return url
  }
  return null
}

/** The art for a player wearing `pet`: the `prefer`red picture, else the other, else `head`. */
export function avatarArt(
  pet: string | null,
  head: number,
  prefer: PetCut = 'chathead',
  files: Record<string, string> = petFiles,
  pets: readonly Pet[] = PETS,
): AvatarArt {
  const found = pet === null ? undefined : pets.find((p) => p.id === pet)
  if (found === undefined) return { kind: 'head', head }
  const order: PetCut[] = prefer === 'chathead' ? ['chathead', 'icon'] : ['icon', 'chathead']
  for (const cut of order) {
    const url = fileNamed(files, cut === 'chathead' ? `${found.id}_chathead` : found.id)
    if (url !== null) return { kind: 'pet', url, name: found.name, cut }
  }
  return { kind: 'head', head }
}
