/**
 * Between rounds: the rows start in the order before the round with the totals then, the
 * gains count up once the Wise Old Man's line has typed, the rows move, and your row pins.
 */

import { render } from '@testing-library/svelte'
import { tick } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { roundLine, shuffleTimes } from '../lib/hiscores'
import type { Segment, Standing } from '../lib/protocol'
import { players } from '../lib/stores'
import { stubAnimations } from '../test-animate'
import Standings from './Standings.svelte'

function standing(
  name: string,
  points: number,
  rank: number,
  gained: number,
  previous: number,
): Standing {
  return {
    player_id: name,
    display_name: name,
    avatar: null,
    points,
    rank,
    points_gained: gained,
    previous_rank: previous,
  }
}

const SEGMENT: Segment = { mode: 'more_less', index: 1, total: 3, start: 3, count: 3 }
const NOW = [standing('Woox', 2400, 1, 1900, 2), standing('Zezima', 1700, 2, 600, 1)]

let restore = () => {}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
  restore = stubAnimations()
  players.set([])
})
afterEach(() => {
  restore()
  vi.useRealTimers()
})

const names = (container: HTMLElement) =>
  [...container.querySelectorAll('tbody tr .name')].map((cell) => cell.textContent?.trim())

describe('Standings', () => {
  it('opens on the round just played, then moves the rows to their new places', async () => {
    const { container } = render(Standings, { standings: NOW, segment: SEGMENT, youId: 'Zezima' })
    const line = roundLine(2)
    expect(container.querySelector('.says')?.textContent).toContain(line)
    expect(names(container)).toEqual(['Zezima (you)', 'Woox'])
    expect(container.querySelector('tr.you')?.classList.contains('pinned')).toBe(false)

    const times = shuffleTimes([...line].length)
    await vi.advanceTimersByTimeAsync(times.settle)
    await tick()
    expect(container.querySelector('.gain.shown')).not.toBeNull()
    expect(names(container)).toEqual(['Zezima (you)', 'Woox'])

    await vi.advanceTimersByTimeAsync(times.move - times.settle)
    await tick()
    expect(names(container)).toEqual(['Woox', 'Zezima (you)'])

    await vi.advanceTimersByTimeAsync(times.pin - times.move)
    await tick()
    expect(container.querySelector('tr.you')?.classList.contains('pinned')).toBe(true)
  })
})
