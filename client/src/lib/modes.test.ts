/**
 * Every mode is presented by a host who speaks all of its lines, picked the same on every
 * screen, and a mode this build does not know is presented by the innkeeper, in lines that
 * fit any round.
 */

import { describe, expect, it } from 'vitest'

import { ASK_MAX, GENERIC_HOST, INNKEEPER, MODES, hostOf, pickLines } from './modes'

// The longest waiting and reveal lines measured to fit two lines at the scroll's foot on a
// 350px screen, the narrowest supported; the reveal line shares its row with the points.
// The foot holds two lines, so a longer one would grow the sheet and move the answers.
const WAITING_MAX = 68
const REVEAL_MAX = 30

describe('hosts', () => {
  it('gives every mode a host, its greeting and blurb, and several of each other line', () => {
    for (const mode of Object.values(MODES)) {
      expect(mode.host.id, mode.id).toMatch(/^[a-z_]+$/)
      expect(mode.host.name, mode.id).not.toBe('')
      for (const line of [mode.greeting, mode.blurb]) expect(line.trim(), mode.id).not.toBe('')
      for (const lines of [mode.ask, mode.waiting, mode.reveal]) {
        expect(lines.length, mode.id).toBeGreaterThanOrEqual(3)
        expect(new Set(lines).size, mode.id).toBe(lines.length)
        for (const line of lines) expect(line.trim(), mode.id).not.toBe('')
      }
    }
  })

  // The TV says the ask line at the sheet's foot too, where the waiting line was.
  it('keeps every ask, waiting and reveal line to two lines at the foot of the scroll', () => {
    for (const lines of [GENERIC_HOST, ...Object.values(MODES)]) {
      for (const line of [...lines.ask, ...lines.waiting]) {
        expect(line.length, line).toBeLessThanOrEqual(WAITING_MAX)
      }
      for (const line of lines.reveal) expect(line.length, line).toBeLessThanOrEqual(REVEAL_MAX)
    }
  })

  it('keeps every ask line within what the server holds for it', () => {
    for (const lines of [GENERIC_HOST, ...Object.values(MODES)]) {
      for (const line of lines.ask) expect([...line].length, line).toBeLessThanOrEqual(ASK_MAX)
    }
  })

  it('has the hosts whose sheet lost its instruction say it in every ask line', () => {
    expect(MODES.guess_examine!.ask).toContain('What is this the examine of?')
    for (const line of MODES.guess_examine!.ask) expect(line).toMatch(/examine/)
    expect(MODES.price_is_right!.ask).toContain('What does this item go for on the Grand Exchange?')
    for (const line of MODES.price_is_right!.ask) expect(line).toMatch(/Grand Exchange/)
  })

  it('has the modes that exist presented by the hosts chosen for them', () => {
    expect(hostOf('price_is_right').host.name).toBe('Grand Exchange Clerk')
    expect(hostOf('more_less').host.name).toBe('Ali Morrisane')
    expect(hostOf('guess_examine').host.name).toBe('The Examiner')
    expect(hostOf('sort_it_out').host).toEqual({ id: 'historian_minas', name: 'Historian Minas' })
    expect(hostOf('custom').host).toEqual(INNKEEPER)
    expect(hostOf('random_events_only').host.id).toBe('crowned_frog')
    expect(hostOf('who_said_that').host.id).toBe('cracked_jennys_tea_cup')
    expect(hostOf('know_your_content_creator').host.id).toBe('gnome_child')
    expect(hostOf('bestiary').host).toEqual({ id: 'zoo_keeper', name: 'Zoo keeper' })
    expect(hostOf('drop_table').host).toEqual({ id: 'nieve', name: 'Nieve' })
    expect(hostOf('odd_one_out').host).toEqual({ id: 'dunce', name: 'Dunce' })
    expect(hostOf('minigame_madness').host).toEqual({ id: 'lanthus', name: 'Lanthus' })
  })

  it('has Lanthus greet Minigame Madness in his own lines', () => {
    const lanthus = hostOf('minigame_madness')
    expect(lanthus.greeting).toBe(
      "Are you team Castle Wars, Barbarian Assault or Pest Control? It doesn't matter tonight. Everyone's on the quiz team!",
    )
    expect(MODES.minigame_madness?.blurb).toBe(
      "I've watched every lobby in Gielinor fill up. Prizes, points, places: tell me what you know.",
    )
    expect(lanthus.waiting).toContain('Waiting for enough players. As always.')
    expect(lanthus.reveal).toContain('The game has ended! Who won?')
  })

  it('has a mode still being built presented by its host-to-be, in the generic lines', () => {
    expect(hostOf('release_order').host).toEqual({ id: 'aris', name: 'Aris' })
    expect(hostOf('release_order').reveal).toBe(GENERIC_HOST.reveal)
  })

  it('has the innkeeper present a mode with no entry, in its generic lines', () => {
    expect(hostOf('zoom_quiz')).toBe(GENERIC_HOST)
    expect(GENERIC_HOST.host).toEqual(INNKEEPER)
  })
})

it('describes The Price is Right as a slider, not four prices', () => {
  expect(MODES.price_is_right?.blurb).not.toMatch(/four/i)
  expect(MODES.price_is_right?.blurb).toMatch(/slide/i)
})

describe('pickLines', () => {
  const at = (index: number, start = 0) => ({ index, segment: { start } })

  it('picks the same lines for the same question on every screen', () => {
    for (const lines of [GENERIC_HOST, ...Object.values(MODES)]) {
      for (let index = 0; index < 12; index++) {
        expect(pickLines(lines, at(index, 3))).toEqual(pickLines({ ...lines }, at(index, 3)))
      }
    }
  })

  it('never repeats a line on consecutive questions of a round, an event between or not', () => {
    for (const lines of [GENERIC_HOST, ...Object.values(MODES)]) {
      for (const start of [0, 7, 20]) {
        for (let index = start; index < start + 20; index++) {
          const now = pickLines(lines, at(index, start))
          for (const gap of [1, 2]) {
            const next = pickLines(lines, at(index + gap, start))
            expect(next.ask, lines.host.id).not.toBe(now.ask)
            expect(next.waiting, lines.host.id).not.toBe(now.waiting)
            expect(next.reveal, lines.host.id).not.toBe(now.reveal)
          }
        }
      }
    }
  })

  it('says every line of a mode in a round long enough', () => {
    const lines = MODES.bestiary!
    const asked = new Set(
      Array.from({ length: lines.ask.length }, (_, i) => pickLines(lines, at(i)).ask),
    )
    expect(asked.size).toBe(lines.ask.length)
  })
})
