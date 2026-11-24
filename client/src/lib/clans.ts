/**
 * The eight elven clans of Prifddinas, whose symbols hang on the wall in its theme: the same
 * clan either side, chosen once each time the page loads.
 *
 * A clan's symbol is the wiki's, fetched into `assets/clans/<clan>.<ext>` by
 * `make fetch-assets`; without one, `ClanSymbol.svelte` draws a flat mark in its place, in
 * fixed colours that go in SVG attributes, since `style-src 'self'` refuses a style written
 * from script.
 */

import { fileNamed } from './trophies'

/** One shape of a placeholder mark. */
export interface MarkPart {
  d: string
  fill?: string
  stroke?: string
  width?: number
}

export interface Clan {
  id: string
  name: string
  /** The placeholder mark, drawn in a 48-unit square centred on 0. */
  mark: MarkPart[]
}

export const CLANS: readonly Clan[] = [
  {
    id: 'amlodd',
    name: 'Amlodd',
    mark: [
      { d: 'M6-16A16 16 0 1 0 6 16 11.5 11.5 0 1 1 6-16Z', fill: '#215394' },
      { d: 'M4.5 0a4.5 4.5 0 1 0 9 0 4.5 4.5 0 1 0-9 0Z', fill: '#63a1eb' },
    ],
  },
  {
    id: 'cadarn',
    name: 'Cadarn',
    mark: [
      { d: 'M-13-13 13 13M13-13-13 13', stroke: '#14625e', width: 3.2 },
      { d: 'M0-15 12-6V6L0 16-12 6V-6Z', fill: '#14625e', stroke: '#e6f5f4', width: 1.8 },
    ],
  },
  {
    id: 'crwys',
    name: 'Crwys',
    mark: [
      { d: 'M0-18C11-8 12 4 0 12-12 4-11-8 0-18Z', fill: '#1d6639' },
      { d: 'M-13 3C-7-3-3 0 0 9M13 3C7-3 3 0 0 9M0 9V19', stroke: '#134526', width: 2.6 },
    ],
  },
  {
    id: 'hefin',
    name: 'Hefin',
    mark: [
      { d: 'M0-17C8-6 8 7 0 15-8 7-8-6 0-17Z', fill: '#a12a47' },
      {
        d: 'M-16 3C-9-6-2-2 0 13-9 13-14 10-16 3ZM16 3C9-6 2-2 0 13 9 13 14 10 16 3Z',
        fill: '#d45976',
      },
    ],
  },
  {
    id: 'iorwerth',
    name: 'Iorwerth',
    mark: [
      { d: 'M-15-12 0 18 15-12 0-3Z', fill: '#9c2020' },
      { d: 'M-7-17 0-6 7-17', stroke: '#9c2020', width: 3 },
    ],
  },
  {
    id: 'ithell',
    name: 'Ithell',
    mark: [
      { d: 'M0-19 14 0 0 19-14 0Z', fill: '#6aa8c9', stroke: '#2c556c', width: 2 },
      { d: 'M0-19 7 0 0 19-7 0Z', fill: '#c8e7f6' },
    ],
  },
  {
    id: 'meilyr',
    name: 'Meilyr',
    mark: [
      { d: 'M-6-16H6V-8L14 9C15 13 11 16 7 16H-7C-11 16-15 13-14 9L-6-8Z', fill: '#5c3a94' },
      { d: 'M-7 6H7L10 12H-10Z', fill: '#c4a6f2' },
    ],
  },
  {
    id: 'trahaearn',
    name: 'Trahaearn',
    mark: [
      { d: 'M-15-6H15L10 3H-10ZM-9 3H9L13 14H-13Z', fill: '#a36b16' },
      { d: 'M0-18 4.5-10 0-7-4.5-10Z', fill: '#e6a83a' },
    ],
  },
]

/** A clan at random, `roll` being a number in [0, 1). */
export function pickClan(roll: number = Math.random()): Clan {
  return CLANS[Math.min(CLANS.length - 1, Math.floor(roll * CLANS.length))]!
}

const symbolFiles = import.meta.glob<string>('../assets/clans/*.{avif,webp,png,jpg,jpeg,svg}', {
  eager: true,
  query: '?url',
  import: 'default',
})

/** The fetched symbol for clan `id`, or null when it still has its placeholder. */
export function symbolFile(id: string, files: Record<string, string> = symbolFiles): string | null {
  return fileNamed(files, id)
}
