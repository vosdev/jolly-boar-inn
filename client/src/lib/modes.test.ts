/**
 * Every mode is presented by a host who speaks all four of its lines, and a mode
 * this build does not know is presented by the innkeeper, in lines that fit any round.
 */

import { describe, expect, it } from 'vitest'

import { GENERIC_HOST, INNKEEPER, MODES, hostOf } from './modes'

// The longest waiting and reveal lines measured to fit two lines at the scroll's foot on a
// 350px screen, the narrowest supported; the reveal line shares its row with the points.
// The foot holds two lines, so a longer one would grow the sheet and move the answers.
const WAITING_MAX = 68
const REVEAL_MAX = 30

describe('hosts', () => {
  it('gives every mode a host and all four lines', () => {
    for (const mode of Object.values(MODES)) {
      expect(mode.host.id, mode.id).toMatch(/^[a-z_]+$/)
      expect(mode.host.name, mode.id).not.toBe('')
      for (const line of [mode.greeting, mode.blurb, mode.waiting, mode.reveal]) {
        expect(line.trim(), mode.id).not.toBe('')
      }
    }
  })

  it('keeps every waiting and reveal line to two lines at the foot of the scroll', () => {
    for (const lines of [GENERIC_HOST, ...Object.values(MODES)]) {
      expect(lines.waiting.length, lines.waiting).toBeLessThanOrEqual(WAITING_MAX)
      expect(lines.reveal.length, lines.reveal).toBeLessThanOrEqual(REVEAL_MAX)
    }
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
