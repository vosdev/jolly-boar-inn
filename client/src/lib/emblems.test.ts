/**
 * A flag dropped into `assets/themes/` is that theme's emblem by name, and a checkout
 * without one draws every placeholder, including the two themes still to come.
 */

import { describe, expect, it } from 'vitest'

import { EMBLEMS, emblemFile } from './emblems'
import { THEMES } from './theme'

describe('emblemFile', () => {
  it('finds the file named for the theme, whatever its extension', () => {
    const files = {
      '../assets/themes/wilderness.png': '/assets/wilderness-abc.png',
      '../assets/themes/jolly.svg': '/assets/jolly-def.svg',
    }
    expect(emblemFile('wilderness', files)).toBe('/assets/wilderness-abc.png')
    expect(emblemFile('jolly', files)).toBe('/assets/jolly-def.svg')
    expect(emblemFile('pollnivneach', files)).toBeNull()
  })

  it('covers every built theme and the two still to come', () => {
    expect(EMBLEMS).toEqual([...THEMES, 'party_room', 'tzhaar'])
  })

  it('has no files in this checkout, so every emblem draws its placeholder', () => {
    for (const theme of EMBLEMS) expect(emblemFile(theme)).toBeNull()
  })
})
