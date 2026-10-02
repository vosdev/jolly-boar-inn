/**
 * The podium's trophy art, found by name at build time (sections 7.3 and 9.1).
 *
 * The trophies are the five Quest Speedrunning renders, which are game assets and so
 * fetched rather than committed (`make fetch-assets`, when it exists). Until one is in
 * `assets/trophies/<tier>.<ext>`, the podium draws the committed placeholder for that
 * tier, `assets/trophies/placeholder/<tier>.svg`: one plain cup, tinted per tier.
 * Dropping a render in replaces it on the next build with no code change.
 *
 * The tiers are art, not tokens, which is why the placeholders are files: their tints
 * live in the pictures, add no token layer, and never touch the verdict or semantic
 * layers a theme is held to.
 */

import type { Tier } from './podium'

// An empty folder is an empty object, so a trophy with no file is
// known to have none before the page asks, and nothing ever 404s.
const trophyFiles = import.meta.glob<string>('../assets/trophies/*.{avif,webp,png,jpg,jpeg,svg}', {
  eager: true,
  query: '?url',
  import: 'default',
})
const placeholderFiles = import.meta.glob<string>('../assets/trophies/placeholder/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
})

export interface TrophyArt {
  url: string
  /** The plain cup standing in for a render nobody has fetched yet. */
  placeholder: boolean
}

/** The trophy tier as a person says it: "Diamond". */
export function tierName(tier: Tier): string {
  return tier.charAt(0).toUpperCase() + tier.slice(1)
}

/** The file called `name` in a glob, whatever its extension. */
export function fileNamed(files: Record<string, string>, name: string): string | null {
  for (const [path, url] of Object.entries(files)) {
    const base = path.slice(path.lastIndexOf('/') + 1)
    if (base.slice(0, base.lastIndexOf('.')) === name) return url
  }
  return null
}

/** The picture for `tier`: its render if there is one, and its placeholder if not. */
export function trophyArt(
  tier: Tier,
  renders: Record<string, string> = trophyFiles,
  placeholders: Record<string, string> = placeholderFiles,
): TrophyArt {
  const render = fileNamed(renders, tier)
  if (render !== null) return { url: render, placeholder: false }
  // Every tier has one committed, so this is never the empty string in a real build.
  return { url: fileNamed(placeholders, tier) ?? '', placeholder: true }
}
