import { describe, expect, it } from 'vitest'

import { ALL_MODE_IDS, COMING_SOON, MODE_RULES, SUGGESTIBLE, pictureOf } from './modeRules'
import { MODES, MODE_FILES, modeCopy } from './modes'
import questionEdits from './questionEdits.ts?raw'
import reports from './reports.ts?raw'
import samples from './samples.ts?raw'
import suggestions from './suggestions.ts?raw'

const SOURCES: Record<string, string> = {
  'suggestions.ts': suggestions,
  'questionEdits.ts': questionEdits,
  'reports.ts': reports,
  'samples.ts': samples,
}

/** The type ids a mode shares, which these files name as types, never as a mode. */
const TYPE_IDS = new Set(MODE_RULES.flatMap((mode) => mode.types))

/**
 * A mode named for something other than a list of modes: `custom` is how a question with no
 * round is drawn, and `random_event` is the NPCs' own questions, which the question schema
 * itself keys on, and the envelope field that names the NPC who asks.
 */
const NOT_A_LIST = new Set([
  'suggestions.ts:custom',
  'suggestions.ts:random_event',
  'questionEdits.ts:random_event',
  'reports.ts:random_event',
])

describe('schema/modes.json', () => {
  it('lists every mode under lib/modes/, built or coming soon, and nothing else', () => {
    const built = Object.keys(MODE_FILES).filter((id) => MODE_FILES[id]?.mode !== undefined)
    const soon = Object.keys(MODE_FILES).filter((id) => MODE_FILES[id]?.upcoming !== undefined)
    const registry = MODE_RULES.map((mode) => mode.id)
    expect(built.sort(), 'a mode file the registry lacks: run `make gen-modes`').toEqual(
      registry.filter((id) => id in MODE_FILES).sort(),
    )
    expect(soon.sort()).toEqual([...COMING_SOON].sort())
    expect(Object.keys(MODE_FILES).sort()).toEqual([...ALL_MODE_IDS].sort())
  })

  it("draws each built mode's picture the way the registry shows it", () => {
    for (const rules of MODE_RULES) {
      expect(MODES[rules.id]?.picture, rules.id).toBe(pictureOf(rules))
    }
    expect(MODES.whos_that_npc?.picture).toBe('shadow')
    expect(MODES.pixel_hunt?.picture).toBe('build')
    expect(MODES.forgetful_bard?.picture).toBe('reveal')
  })

  it('leaves the picture, the extra seconds and the steps out of the mode files', () => {
    for (const [id, file] of Object.entries(MODE_FILES)) {
      expect(file.mode?.picture, id).toBeUndefined()
      const sample = file.sample as Record<string, unknown> | undefined
      expect(sample?.extra, id).toBeUndefined()
      expect(sample?.steps, id).toBeUndefined()
    }
  })

  it('gives every mode that takes suggestions a card of its own place', () => {
    const cards = modeCopy('card')
    expect(Object.keys(cards).sort()).toEqual([...SUGGESTIBLE.keys()].sort())
    const places = Object.values(cards).map((card) => card.place)
    expect(new Set(places).size).toBe(places.length)
  })
})

describe('the files that apply mode rules', () => {
  it.each(Object.keys(SOURCES))('%s names no mode but as the exceptions say', (name) => {
    const source = SOURCES[name]!
    const named = ALL_MODE_IDS.filter(
      (id) => !TYPE_IDS.has(id) && new RegExp(`['"\`]${id}['"\`]`).test(source),
    )
    expect(named.filter((id) => !NOT_A_LIST.has(`${name}:${id}`))).toEqual([])
  })
})
