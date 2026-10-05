/**
 * The pet list, its manifest entries, and the fall back to the head for a pet with no file.
 */

import { describe, expect, it } from 'vitest'

import MANIFEST from '../../../data/assets.json'
import { avatarArt, PETS } from './pets'

const targets = new Set(Object.keys(MANIFEST))

describe('the pet list', () => {
  it('has a manifest entry for every pet, a chathead or an icon', () => {
    const bare = PETS.filter((pet) => !targets.has(`pets/${pet.id}.png`) && !targets.has(`pets/${pet.id}_chathead.png`))
    expect(bare.map((pet) => pet.id)).toEqual([])
  })

  it('has a pet for every manifest entry', () => {
    const ids = new Set(PETS.map((pet) => pet.id))
    const orphans = [...targets]
      .filter((t) => t.startsWith('pets/'))
      .filter((t) => !ids.has(t.slice(5, -4).replace(/_chathead$/, '')) && !ids.has(t.slice(5, -4)))
    expect(orphans).toEqual([])
  })

  it('has distinct ids and names', () => {
    expect(new Set(PETS.map((pet) => pet.id)).size).toBe(PETS.length)
    expect(new Set(PETS.map((pet) => pet.name)).size).toBe(PETS.length)
  })
})

describe('avatarArt', () => {
  const pets = [{ id: 'aggy', name: 'Aggy' }]
  const both = { '../assets/pets/aggy_chathead.png': '/assets/aggy-head.png', '../assets/pets/aggy.png': '/assets/aggy.png' }

  it('draws the chathead by default', () => {
    expect(avatarArt('aggy', 3, 'chathead', both, pets)).toEqual({
      kind: 'pet',
      url: '/assets/aggy-head.png',
      name: 'Aggy',
      cut: 'chathead',
    })
  })

  it('draws the icon when asked to', () => {
    expect(avatarArt('aggy', 3, 'icon', both, pets)).toMatchObject({ kind: 'pet', url: '/assets/aggy.png', cut: 'icon' })
  })

  it('uses the other picture when the preferred one has no file', () => {
    const iconOnly = { '../assets/pets/aggy.png': '/assets/aggy.png' }
    const chatOnly = { '../assets/pets/aggy_chathead.png': '/assets/aggy-head.png' }
    expect(avatarArt('aggy', 3, 'chathead', iconOnly, pets)).toMatchObject({ url: '/assets/aggy.png', cut: 'icon' })
    expect(avatarArt('aggy', 3, 'icon', chatOnly, pets)).toMatchObject({ url: '/assets/aggy-head.png', cut: 'chathead' })
  })

  it('falls back to the head for a pet with no file', () => {
    expect(avatarArt('aggy', 3, 'chathead', {}, pets)).toEqual({ kind: 'head', head: 3 })
  })

  it('falls back to the head for no pet and for one that is not listed', () => {
    const files = { '../assets/pets/ghost.png': '/assets/ghost.png' }
    expect(avatarArt(null, 3, 'chathead', files, pets)).toEqual({ kind: 'head', head: 3 })
    expect(avatarArt('ghost', 3, 'chathead', files, pets)).toEqual({ kind: 'head', head: 3 })
  })
})
