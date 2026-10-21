/**
 * The pet list, its manifest entries, who can be picked, which pet a player wears, and the
 * fall back to the boar for a pet with no file.
 */

import { describe, expect, it } from 'vitest'

import MANIFEST from '../../../data/assets.json'
import { avatarArt, PETS, PICKABLE, pickablePets, petName, petOf, randomPet } from './pets'
import { FALLBACK_NPC, npcArt } from './npcs'

const targets = new Set(Object.keys(MANIFEST))

describe('the pet list', () => {
  it('has a manifest entry for every pet, a chathead or an icon', () => {
    const bare = PETS.filter(
      (pet) => !targets.has(`pets/${pet.id}.png`) && !targets.has(`pets/${pet.id}_chathead.png`),
    )
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

describe('who can be picked', () => {
  const pets = [
    { id: 'zulrah', name: 'Pet snakeling' },
    { id: 'aggy', name: 'Aggy' },
    { id: 'chewy', name: 'Chewy' },
    { id: 'baby_mole', name: 'baby Mole' },
  ]
  const manifest = {
    'pets/zulrah.png': 'x',
    'pets/zulrah_chathead.png': 'x',
    'pets/aggy.png': 'x',
    'pets/aggy_chathead.png': 'x',
    'pets/chewy_chathead.png': 'x',
    'pets/baby_mole.png': 'x',
    'pets/baby_mole_chathead.png': 'x',
  }

  it('is every pet with both pictures in the manifest, A to Z whatever the case', () => {
    expect(pickablePets(pets, manifest).map((pet) => pet.id)).toEqual([
      'aggy',
      'baby_mole',
      'zulrah',
    ])
  })

  it('leaves out a pet with only one picture, however the manifest lists it', () => {
    expect(pickablePets(pets, { 'pets/aggy.png': 'x' })).toEqual([])
  })

  it('has a pet for every seat of a full room, each with both pictures', () => {
    expect(PICKABLE.length).toBeGreaterThanOrEqual(50)
    for (const pet of PICKABLE) {
      expect(targets.has(`pets/${pet.id}.png`) && targets.has(`pets/${pet.id}_chathead.png`)).toBe(
        true,
      )
    }
  })
})

describe('which pet a player wears', () => {
  it('is the one they chose, and never one the pet list happens to give them', () => {
    expect(petOf({ id: 'u1', avatar: 'aggy' })).toBe('aggy')
    // The server stores a pet for everybody; a missing or unknown one is the boar,
    // which does not move when the pickable list does.
    expect(petOf({ id: 'u1', avatar: null })).toBe('')
    expect(petOf({ id: 'u1' })).toBe('')
    expect(petOf({ id: 'u1', avatar: 'not_a_pet' })).toBe('')
    expect(avatarArt(petOf({ id: 'u1' }), 'chathead', {}).cut).toBe('fallback')
  })

  it('names a pet, and says "Pet" for one it does not know', () => {
    expect(petName('aggy')).toBe('Aggy')
    expect(petName('not_a_pet')).toBe('Pet')
  })
})

describe('randomPet', () => {
  const pets = [
    { id: 'a', name: 'A' },
    { id: 'b', name: 'B' },
    { id: 'c', name: 'C' },
  ]

  it('never returns the previous pet, nor one that is taken while any is free', () => {
    for (let i = 0; i < 50; i++) expect(randomPet(['b'], 'a', pets)).toBe('c')
  })

  it('allows a taken pet once every pet is, but still not the previous one', () => {
    for (let i = 0; i < 50; i++) expect(randomPet(['a', 'b', 'c'], 'a', pets)).not.toBe('a')
  })
})

describe('avatarArt', () => {
  const both = {
    '../assets/pets/aggy_chathead.png': '/assets/aggy-head.png',
    '../assets/pets/aggy.png': '/assets/aggy.png',
  }

  it('draws the chathead by default', () => {
    expect(avatarArt('aggy', 'chathead', both)).toEqual({
      url: '/assets/aggy-head.png',
      cut: 'chathead',
    })
  })

  it('draws the icon when asked to', () => {
    expect(avatarArt('aggy', 'icon', both)).toEqual({ url: '/assets/aggy.png', cut: 'icon' })
  })

  it('uses the other picture when the preferred one has no file', () => {
    const iconOnly = { '../assets/pets/aggy.png': '/assets/aggy.png' }
    const chatOnly = { '../assets/pets/aggy_chathead.png': '/assets/aggy-head.png' }
    expect(avatarArt('aggy', 'chathead', iconOnly)).toEqual({
      url: '/assets/aggy.png',
      cut: 'icon',
    })
    expect(avatarArt('aggy', 'icon', chatOnly)).toEqual({
      url: '/assets/aggy-head.png',
      cut: 'chathead',
    })
  })

  it('falls back to the boar for a pet with no file', () => {
    expect(avatarArt('aggy', 'chathead', {})).toEqual({
      url: npcArt(FALLBACK_NPC).url,
      cut: 'fallback',
    })
  })
})
