/**
 * The roster's copy. That these ids are exactly `server/app/random_events.py`'s is
 * `server/tests/test_random_events.py`'s to say, since it is the server's list that
 * decides who may be drawn; this holds each entry to being a card worth drawing.
 */

import { describe, expect, it } from 'vitest'

import { MODES } from './modes'
import { RANDOM_EVENTS, STRANGER, randomEventFor } from './randomEvents'

describe('randomEvents', () => {
  it('gives every NPC a name, a theme, a line and its picture’s reference', () => {
    expect(new Set(RANDOM_EVENTS.map((npc) => npc.id)).size).toBe(RANDOM_EVENTS.length)
    for (const npc of RANDOM_EVENTS) {
      expect(npc.id).toMatch(/^[a-z][a-z0-9_]{0,31}$/)
      expect(npc.name.trim()).not.toBe('')
      expect(npc.theme.trim()).not.toBe('')
      // One short sentence or two, as a dialogue box would hold it.
      expect(npc.line.length).toBeGreaterThan(0)
      expect(npc.line.length).toBeLessThanOrEqual(90)
      expect(npc.asset).toBe(`npc:${npc.id}`)
    }
  })

  it('finds an NPC by id, and stands the Mysterious Old Man in for one it does not know', () => {
    expect(randomEventFor('death').name).toBe('Death')
    const stranger = randomEventFor('rick_turpentine')
    expect(stranger.name).toBe('Mysterious Old Man')
    expect(stranger.id).toBe('rick_turpentine')
    expect(randomEventFor('').name).toBe('Mysterious Old Man')
  })

  it('has no NPC who also hosts a mode, so an interruption never looks like the round', () => {
    const faces = new Set([...RANDOM_EVENTS.map((npc) => npc.id), STRANGER])
    const hosts = Object.values(MODES).map((mode) => mode.host.id)
    expect(hosts.filter((id) => faces.has(id))).toEqual([])
  })
})
