/**
 * The hiscores table on the Wise Old Man's scroll: the "#" header, a name that never
 * splits its "(you)", the round's gain under each total and the places moved under each
 * rank, and a row that starts where it stood before the round.
 */

import { render, within } from '@testing-library/svelte'
import { beforeEach, describe, expect, it } from 'vitest'

import type { Standing } from '../lib/protocol'
import { players } from '../lib/stores'
import { petsDrawn } from '../test-pets'
import Hiscores from './Hiscores.svelte'

const LONG = 'Cow31337Kill' // 12 characters, the longest a name may be

function standing(
  name: string,
  points: number,
  rank: number,
  gained: number,
  previous: number | null,
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

const ROUND_TWO = [
  standing('Woox', 2400, 1, 1900, 2),
  standing(LONG, 1700, 2, 600, 1),
  standing('Lynx', 900, 3, 0, 3),
]

beforeEach(() => players.set([]))

function rows(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>('tbody tr')]
}

describe('Hiscores', () => {
  it('heads the rank column "#", and still says Rank to a screen reader', () => {
    const { container } = render(Hiscores, { rows: ROUND_TWO })
    const head = container.querySelector('th.rank')!
    expect(
      within(head as HTMLElement)
        .getByText('#')
        .getAttribute('aria-hidden'),
    ).toBe('true')
    expect(head.querySelector('.sr')?.textContent).toBe('Rank')
  })

  it('keeps "(you)" whole after the longest name', () => {
    const { container } = render(Hiscores, { rows: ROUND_TWO, youId: LONG })
    const you = container.querySelector('tr.you')!
    expect(you.querySelector('.name')?.textContent?.trim()).toBe(`${LONG} (you)`)
    // The space before it is outside the note, so the line can break there and only there.
    expect(you.querySelector('.note')?.textContent).toBe('(you)')
  })

  it('writes the round’s gain under each total and the places moved under each rank', () => {
    const { container } = render(Hiscores, { rows: ROUND_TWO })
    const [woox, long, lynx] = rows(container)
    expect(woox!.querySelector('.total')?.textContent).toBe('2,400')
    expect(woox!.querySelector('.gain')?.textContent).toBe('+1,900 this round')
    expect(woox!.querySelector('.move')?.textContent).toBe('up 1')
    expect(long!.querySelector('.move')?.textContent).toBe('down 1')
    expect(lynx!.querySelector('.move')).toBeNull()
  })

  it('draws no moves in the first round, which has no rank before it', () => {
    const first = [standing('Woox', 900, 1, 900, null), standing('Lynx', 0, 2, 0, null)]
    const { container } = render(Hiscores, { rows: first })
    expect(container.querySelector('.move')).toBeNull()
  })

  it('draws neither moves nor gains for a past game, even one kept before standings had them', () => {
    const kept = { player_id: 'Dorn', display_name: 'Dorn', avatar: null, points: 900, rank: 1 }
    const { container } = render(Hiscores, {
      rows: [...ROUND_TWO, kept as Standing],
      changes: false,
    })
    expect(container.querySelector('.move')).toBeNull()
    expect(container.querySelector('.gain')).toBeNull()
    expect(container.textContent).not.toContain('NaN')
  })

  it('starts a row where it stood before the round, until it settles', () => {
    const { container } = render(Hiscores, { rows: ROUND_TWO, settled: false, instant: true })
    const [woox] = rows(container)
    expect(woox!.querySelector('.number')?.textContent).toBe('2')
    expect(woox!.querySelector('.total')?.textContent).toBe('500')
    expect(woox!.querySelector('.gain')?.classList.contains('shown')).toBe(false)
    expect(woox!.querySelector('.move')).toBeNull()
  })

  it('draws the pet and name the room last sent over the standing’s', () => {
    players.set([
      {
        id: 'Woox',
        display_name: 'Woox2',
        avatar: 'baby_mole',
        role: 'player',
        connected: true,
        ready: false,
        editing: false,
        team: null,
      },
    ])
    const { container } = render(Hiscores, { rows: ROUND_TWO })
    expect(petsDrawn(rows(container)[0]!)).toEqual([{ pet: 'baby_mole', size: 28 }])
    expect(rows(container)[0]!.querySelector('.name')?.textContent?.trim()).toBe('Woox2')
  })
})
