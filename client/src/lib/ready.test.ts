/** The ready check's threshold and who it counts, as the server has them. */

import { describe, expect, it } from 'vitest'

import type { PlayerView } from './protocol'
import { playing, readyThreshold } from './ready'

function player(display_name: string, role: PlayerView['role']): PlayerView {
  return { display_name, role } as PlayerView
}

describe('playing', () => {
  it('leaves out the TV, so nobody waits on it', () => {
    const roster = [player('Host', 'admin'), player('Telly', 'tv'), player('Zezima', 'player')]
    expect(playing(roster).map((p) => p.display_name)).toEqual(['Host', 'Zezima'])
  })
})

describe('readyThreshold', () => {
  it('is two of three, and one for a room of one', () => {
    expect(readyThreshold(3)).toBe(2)
    expect(readyThreshold(1)).toBe(1)
  })
})
