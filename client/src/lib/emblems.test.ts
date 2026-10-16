/**
 * An icon fetched into `assets/themes/` is that theme's emblem by name, and a checkout
 * without one draws every placeholder.
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

  it('covers every built theme, with none still to come', () => {
    expect(EMBLEMS).toEqual([...THEMES])
  })

  it('finds every theme’s icon or none, whatever this checkout has fetched', () => {
    const found = EMBLEMS.filter((theme) => emblemFile(theme) !== null)
    expect(found.length === 0 || found.length === EMBLEMS.length).toBe(true)
  })
})
