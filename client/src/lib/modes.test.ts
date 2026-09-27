/**
 * D14: every mode is presented by a host who speaks all four of its lines, and a mode
 * this build does not know is presented by the innkeeper, in lines that fit any round.
 */

import { describe, expect, it } from 'vitest'

import { GENERIC_HOST, INNKEEPER, MODES, hostOf } from './modes'

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

  it('has the modes that exist presented by the hosts chosen for them', () => {
    expect(hostOf('price_is_right').host.name).toBe('Grand Exchange Clerk')
    expect(hostOf('more_less').host.name).toBe('Ali Morrisane')
    expect(hostOf('guess_examine').host.name).toBe('The Examiner')
    expect(hostOf('custom').host).toEqual(INNKEEPER)
  })

  it('has the innkeeper present a mode with no entry, in its generic lines', () => {
    expect(hostOf('zoom_quiz')).toBe(GENERIC_HOST)
    expect(GENERIC_HOST.host).toEqual(INNKEEPER)
  })
})
