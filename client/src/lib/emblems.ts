/**
 * Each theme's emblem, found by name at build time: the Leagues flag of the area the
 * theme's place is in, or a placeholder until somebody drops the flag in.
 *
 * A file in `assets/themes/<theme>.<ext>` is the emblem. Without one, `Emblem.svelte`
 * draws the committed placeholder: a flat mark inline rather than a file, because a mark
 * in the theme's own `--accent` can only be drawn where custom properties reach (section
 * 13 of ideas/design.md), and a copied hex would drift from the palette.
 */

import { THEMES, type Theme } from './theme'
import { fileNamed } from './trophies'

/** Themes the menu lists, disabled, ahead of their palette in `app.css`, by name. */
export const UNBUILT_THEMES = {} as const

export type UnbuiltTheme = keyof typeof UNBUILT_THEMES

export type EmblemId = Theme | UnbuiltTheme

/** Every emblem with a placeholder: the built themes, then the ones still to come. */
export const EMBLEMS: readonly EmblemId[] = [
  ...THEMES,
  ...(Object.keys(UNBUILT_THEMES) as UnbuiltTheme[]),
]

/** Whether `id` has a palette to paint with yet. */
export function isBuilt(id: EmblemId): id is Theme {
  return (THEMES as readonly string[]).includes(id)
}

const emblemFiles = import.meta.glob<string>('../assets/themes/*.{avif,webp,png,jpg,jpeg,svg}', {
  eager: true,
  query: '?url',
  import: 'default',
})

/** The dropped-in flag for `theme`, or null when it still has its placeholder. */
export function emblemFile(
  theme: EmblemId,
  files: Record<string, string> = emblemFiles,
): string | null {
  return fileNamed(files, theme)
}
