/**
 * `data/assets.json` against the art the client asks for. A fresh checkout has no image
 * files, so "has art" means "has a manifest entry": `make fetch-assets` then fetches it.
 */

import { describe, expect, it } from 'vitest'

import MANIFEST from '../../../data/assets.json'
import { INNKEEPER, MODES } from './modes'
import { TIERS } from './podium'
import { randomEventFor } from './randomEvents'

const targets = Object.keys(MANIFEST)

/** Whether `folder` has a file named `name`, whatever its extension. */
function hasEntry(folder: string, name: string): boolean {
  return targets.some((target) => target.slice(0, target.lastIndexOf('.')) === `${folder}/${name}`)
}

/** An NPC needs its chathead, or its render where the wiki has no chathead. */
function hasNpc(id: string): boolean {
  return hasEntry('npcs', `${id}_chathead`) || hasEntry('npcs', id)
}

describe('the asset manifest', () => {
  it('has art for every mode host but the innkeeper, who is committed', () => {
    const hosts = new Set(Object.values(MODES).map((mode) => mode.host.id))
    hosts.delete(INNKEEPER.id)
    expect([...hosts].filter((id) => !hasNpc(id))).toEqual([])
  })

  it('has art for the Mysterious Old Man, who stands in for an unknown event NPC', () => {
    const stranger = randomEventFor('no_such_npc').asset.replace(/^npc:/, '')
    expect(hasNpc(stranger)).toBe(true)
  })

  it('has a trophy for every podium tier', () => {
    expect(TIERS.filter((tier) => !hasEntry('trophies', tier))).toEqual([])
  })
})
