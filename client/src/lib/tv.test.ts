import { describe, expect, it } from 'vitest'

import type { PlayerView } from './protocol'
import { answersOnly } from './tv'

function player(id: string, role: PlayerView['role'], connected = true): PlayerView {
  return {
    id,
    display_name: id,
    avatar: null,
    role,
    team: null,
    connected,
    ready: false,
    editing: false,
  }
}

describe('answersOnly', () => {
  const you = player('you', 'player')

  it('is on for a player while the TV is connected', () => {
    expect(answersOnly([you, player('tv', 'tv')], you)).toBe(true)
  })

  it('is on for an admin too', () => {
    const admin = player('you', 'admin')
    expect(answersOnly([admin, player('tv', 'tv')], admin)).toBe(true)
  })

  it('is off while the TV is disconnected, and with no TV', () => {
    expect(answersOnly([you, player('tv', 'tv', false)], you)).toBe(false)
    expect(answersOnly([you, player('ann', 'player')], you)).toBe(false)
  })

  it('is off for the TV itself', () => {
    const tv = player('tv', 'tv')
    expect(answersOnly([you, tv], tv)).toBe(false)
  })
})
