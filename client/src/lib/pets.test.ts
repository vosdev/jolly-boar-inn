/**
 * The pet list, its manifest entries, and the fall back to the head for a pet with no file.
 */

import { describe, expect, it } from 'vitest'

import MANIFEST from '../../../data/assets.json'
import { avatarArt, PETS, petUrl } from './pets'

const targets = new Set(Object.keys(MANIFEST))

describe('the pet list', () => {
  it('has a manifest entry for every pet', () => {
    expect(PETS.filter((pet) => !targets.has(`pets/${pet.id}.png`)).map((pet) => pet.id)).toEqual([])
  })

  it('has a pet for every manifest entry', () => {
    const ids = new Set(PETS.map((pet) => pet.id))
    const orphans = [...targets].filter((t) => t.startsWith('pets/') && !ids.has(t.slice(5, -4)))
    expect(orphans).toEqual([])
  })

  it('has distinct ids and names', () => {
    expect(new Set(PETS.map((pet) => pet.id)).size).toBe(PETS.length)
    expect(new Set(PETS.map((pet) => pet.name)).size).toBe(PETS.length)
  })
})

describe('avatarArt', () => {
  const pets = [{ id: 'aggy', name: 'Aggy' }]

  it('draws the pet when its file is there', () => {
    const files = { '../assets/pets/aggy.png': '/assets/aggy.png' }
    expect(petUrl('aggy', files)).toBe('/assets/aggy.png')
    expect(avatarArt('aggy', 3, files, pets)).toEqual({ kind: 'pet', url: '/assets/aggy.png', name: 'Aggy' })
  })

  it('falls back to the head for a pet with no file', () => {
    expect(avatarArt('aggy', 3, {}, pets)).toEqual({ kind: 'head', head: 3 })
  })

  it('falls back to the head for no pet and for one that is not listed', () => {
    const files = { '../assets/pets/ghost.png': '/assets/ghost.png' }
    expect(avatarArt(null, 3, files, pets)).toEqual({ kind: 'head', head: 3 })
    expect(avatarArt('ghost', 3, files, pets)).toEqual({ kind: 'head', head: 3 })
  })
})
