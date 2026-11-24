/**
 * Between rounds: the rows start in the order before the round with the totals then, the
 * gains count up once the Wise Old Man's line has typed in his bubble, the rows move, and
 * your row pins. The table panel names the next round and counts down to it.
 */

import { render, screen } from '@testing-library/svelte'
import { tick } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { roundLine, shuffleTimes } from '../lib/hiscores'
import type { PlayerView, Segment, Standing, TeamStanding } from '../lib/protocol'
import { players, standingsLive } from '../lib/stores'
import { stubAnimations } from '../test-animate'
import Standings from './Standings.svelte'
import nextUpSource from './NextUp.svelte?raw'

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
    expect(container.querySelector('.bubble .speech')?.textContent).toContain(line)
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

  it('ranks a team game’s teams, each with its members by their own points', async () => {
    const teams: TeamStanding[] = [
      { team: 'zamorak', points: 1500, rank: 1, points_gained: 1000, previous_rank: 2 },
      { team: 'saradomin', points: 1200, rank: 2, points_gained: 200, previous_rank: 1 },
    ]
    const now = [
      standing('Woox', 2400, 1, 1900, 2),
      standing('Zezima', 1700, 2, 600, 1),
      standing('Lynx', 700, 3, 100, 3),
      standing('Mod Ash', 600, 4, 100, 4),
    ]
    const member = (id: string, team: PlayerView['team']): PlayerView => ({
      id,
      display_name: id,
      avatar: null,
      role: 'player',
      team,
      connected: true,
      ready: false,
      editing: false,
      item: null,
    })
    players.set([
      member('Woox', 'zamorak'),
      member('Zezima', 'saradomin'),
      member('Lynx', 'zamorak'),
      member('Mod Ash', 'saradomin'),
    ])
    const { container } = render(Standings, {
      standings: now,
      teamStandings: teams,
      segment: SEGMENT,
      youId: 'Lynx',
    })
    const teamNames = () =>
      [...container.querySelectorAll('.team .head .name')].map((cell) => cell.textContent)
    const members = (god: string) =>
      [...container.querySelectorAll(`.team[data-team='${god}'] .members .who`)].map((who) =>
        who.textContent?.trim(),
      )

    expect(container.querySelector('.hiscores')).toBeNull()
    expect(teamNames()).toEqual(['Saradomin', 'Zamorak'])

    const times = shuffleTimes([...roundLine(2)].length)
    await vi.advanceTimersByTimeAsync(times.move)
    await tick()
    expect(teamNames()).toEqual(['Zamorak', 'Saradomin'])
    expect(container.querySelector(".team[data-team='zamorak'] .moved")?.textContent).toBe('up 1')
    expect(container.querySelector(".team[data-team='zamorak'] .round")?.textContent).toBe(
      '+1,000 this round',
    )
    expect(members('zamorak')).toEqual(['Woox', 'Lynx (you)'])
    expect(members('saradomin')).toEqual(['Zezima', 'Mod Ash'])
  })

  it('keeps the player hiscores in a normal game', () => {
    const { container } = render(Standings, { standings: NOW, segment: SEGMENT })
    expect(container.querySelector('.hiscores')).not.toBeNull()
    expect(container.querySelector('.team-hiscores')).toBeNull()
  })
})

describe('Next up', () => {
  const NEXT: Segment = { mode: 'more_less', index: 2, total: 3, start: 6, count: 5 }

  it('names the next round and counts down to it between rounds', () => {
    const endsAt = new Date(Date.now() + 8_000).toISOString()
    render(Standings, { standings: NOW, segment: SEGMENT, next: NEXT, endsAt })
    const panel = screen.getByRole('region', { name: 'Next up' })
    expect(panel.textContent).toContain('More or Less')
    expect(panel.textContent).toContain('Round 3 of 3, 5 questions')
    expect(panel.querySelector('.starts')?.textContent).toMatch(/Moving on in\s*8/)
    expect(panel.textContent).not.toContain('Starts in')
  })

  it('is as tall as its content, the count under the mode, not stretched to the column', () => {
    const rule = (selector: string) => {
      const start = nextUpSource.indexOf(`\n  ${selector} {`)
      expect(start).toBeGreaterThan(-1)
      return nextUpSource.slice(start, nextUpSource.indexOf('}', start))
    }
    expect(rule('.next-up')).not.toMatch(/flex: 1|flex-grow|height/)
    expect(rule('.starts')).not.toContain('margin: auto')
  })

  it('starts its strip past the Emotes button when there is one', () => {
    const endsAt = new Date(Date.now() + 8_000).toISOString()
    render(Standings, { standings: NOW, segment: SEGMENT, next: NEXT, endsAt, stacked: true })
    expect(screen.getByRole('region', { name: 'Next up' }).classList.contains('after')).toBe(false)
    expect(nextUpSource).toMatch(/\.strip\.after \{\s*left: calc\(0\.75rem \+ 52px \+ 0\.5rem\);/)
  })

  it('is a strip at the foot on a phone', () => {
    const endsAt = new Date(Date.now() + 8_000).toISOString()
    render(Standings, { standings: NOW, segment: SEGMENT, next: NEXT, endsAt, stacked: true })
    const strip = screen.getByRole('region', { name: 'Next up' })
    expect(strip.classList.contains('strip')).toBe(true)
    expect(strip.textContent).toMatch(/Next up:\s*More or Less\s*8/)
  })

  it('never has a screen reader read its count out every second', () => {
    const endsAt = new Date(Date.now() + 8_000).toISOString()
    for (const stacked of [false, true]) {
      const { unmount } = render(Standings, {
        standings: NOW,
        segment: SEGMENT,
        next: NEXT,
        endsAt,
        stacked,
      })
      const panel = screen.getByRole('region', { name: 'Next up' })
      expect(panel.querySelector('[aria-live]')).toBeNull()
      unmount()
    }
  })

  it('is not shown without a next round, nor on the TV', () => {
    render(Standings, { standings: NOW, segment: SEGMENT })
    expect(screen.queryByRole('region', { name: 'Next up' })).toBeNull()
    render(Standings, { standings: NOW, segment: SEGMENT, next: NEXT, tv: true })
    expect(screen.queryByRole('region', { name: 'Next up' })).toBeNull()
  })
})

describe('Standings rows', () => {
  it('are one line on a desktop, the move and the gain in columns of their own', async () => {
    const { container } = render(Standings, { standings: NOW, segment: SEGMENT })
    const heads = [...container.querySelectorAll('thead th')].map((th) => th.textContent?.trim())
    expect(heads).toEqual(['Rank', 'Moved', 'Name', 'This round', 'Points'])
    await vi.advanceTimersByTimeAsync(shuffleTimes([...roundLine(2)].length).move)
    await tick()
    const first = container.querySelector('tbody tr')!
    expect(first.querySelector('td.moved')?.textContent).toBe('up 1')
    expect(first.querySelector('td.round')?.textContent).toBe('+1,900 this round')
  })

  it('keep two lines a row on a phone', () => {
    const { container } = render(Standings, { standings: NOW, segment: SEGMENT, stacked: true })
    expect(container.querySelector('td.round')).toBeNull()
    expect(container.querySelector('td.points .gain')).not.toBeNull()
  })
})

describe('Standings on the TV', () => {
  it('draws the hiscores on a wide TV stage', () => {
    const { container } = render(Standings, { standings: NOW, segment: SEGMENT, tv: true })
    expect(container.querySelector('.stage.tv.wide')).not.toBeNull()
    expect(names(container)).toHaveLength(2)
  })
})

describe('Mystery Boxes on the standings', () => {
  const ROWS = [
    standing('Woox', 2400, 1, 1900, 2),
    standing('Zezima', 1700, 2, 600, 1),
    standing('Lynx', 700, 3, 100, 3),
    standing('Mod Ash', 600, 4, 100, 4),
  ]
  const DROPS = [
    { player_id: 'Lynx', item: 'super_restore' },
    { player_id: 'Mod Ash', item: 'ring_of_life' },
  ]
  const NEXT: Segment = { mode: 'more_less', index: 2, total: 3, start: 6, count: 3 }

  beforeEach(() => standingsLive.set(true))
  afterEach(() => standingsLive.set(false))

  const boxRow = (container: HTMLElement, name: string) =>
    [...container.querySelectorAll('tbody tr')].find((row) =>
      row.querySelector('.name')?.textContent?.includes(name),
    )

  it('opens one on each finder’s row once the rows have moved, into the item’s icon', async () => {
    const { container } = render(Standings, {
      standings: ROWS,
      segment: SEGMENT,
      youId: 'Woox',
      drops: DROPS,
    })
    const times = shuffleTimes([...roundLine(2)].length)
    expect(container.querySelector('.mystery-box')).toBeNull()

    await vi.advanceTimersByTimeAsync(times.pin - 1)
    await tick()
    expect(container.querySelector('.mystery-box')).toBeNull()

    await vi.advanceTimersByTimeAsync(1)
    await tick()
    const lynx = boxRow(container, 'Lynx')?.querySelector('.mystery-box')
    const ash = boxRow(container, 'Mod Ash')?.querySelector('.mystery-box')
    expect(lynx?.getAttribute('data-opened')).toBe('animated')
    expect(ash?.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe('Ring of Life')
    expect(lynx?.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe('Super restore')
    expect(boxRow(container, 'Woox')?.querySelector('.mystery-box')).toBeNull()
    // Each a beat after the one above, so they open down the column.
    expect((ash as HTMLElement).style.getPropertyValue('--delay')).toBe('150ms')
  })

  it('shows yours in a "You found" panel with the next round it goes after', async () => {
    players.set([
      {
        id: 'Mod Ash',
        display_name: 'Mod Ash',
        avatar: null,
        role: 'player',
        team: null,
        connected: true,
        ready: false,
        editing: false,
        item: { id: 'ring_of_life', charges: null },
      },
    ])
    render(Standings, {
      standings: ROWS,
      segment: SEGMENT,
      next: NEXT,
      youId: 'Mod Ash',
      drops: DROPS,
    })
    expect(screen.queryByRole('heading', { name: 'You found' })).toBeNull()
    await vi.advanceTimersByTimeAsync(shuffleTimes([...roundLine(2)].length).pin)
    await tick()
    const panel = screen.getByRole('heading', { name: 'You found' }).closest('section')
    expect(panel?.textContent).toContain('Ring of Life')
    expect(panel?.textContent).toContain('Expires after More or Less')
  })

  it('stands open at once on a screen that arrived after the standings began', () => {
    standingsLive.set(false)
    const { container } = render(Standings, {
      standings: ROWS,
      segment: SEGMENT,
      youId: 'Woox',
      drops: DROPS,
    })
    const boxes = [...container.querySelectorAll('.mystery-box')]
    expect(boxes.map((box) => box.getAttribute('data-opened'))).toEqual(['instant', 'instant'])
  })
})
