/**
 * The final screen: the Wise Old Man presents fifth place to first, each with its trophy
 * beside the scroll, then the full hiscores; Skip goes straight there, and a past game or
 * a reload never plays the ceremony.
 */

import { fireEvent, render, screen } from '@testing-library/svelte'
import { createRawSnippet, tick } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CEREMONY, ceremonyTimes, FINAL_INTRO } from '../lib/hiscores'
import type { Standing, TeamStanding } from '../lib/protocol'
import { players } from '../lib/stores'
import type { TeamId } from '../lib/teams'
import { trophyArt } from '../lib/trophies'
import { stubAnimations } from '../test-animate'
import FinalStandings from './FinalStandings.svelte'

function standing(name: string, points: number, rank: number): Standing {
  return {
    player_id: name,
    display_name: name,
    avatar: null,
    points,
    rank,
    points_gained: points,
    previous_rank: null,
  }
}

const TWO = [standing('Zezima', 900, 1), standing('Woox', 400, 2), standing('Lynx', 0, 3)]
const LINES = [FINAL_INTRO, 'So close! In second…', 'And top of the hiscores…']
const children = createRawSnippet(() => ({ render: () => '<button type="button">Home</button>' }))

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

const placed = () => document.querySelector('.placed .names')?.textContent
const trophy = () => document.querySelector('.beside img')?.getAttribute('src') ?? null

describe('FinalStandings', () => {
  it('presents second then first, each with its trophy, and then the full hiscores', async () => {
    render(FinalStandings, { standings: TWO, youId: 'Woox', ceremony: true, children })
    const times = ceremonyTimes(LINES.map((line) => [...line].length))
    expect(document.querySelector('.hiscores')).toBeNull()
    expect(screen.getByRole('button', { name: 'Skip to the hiscores' })).toBeTruthy()

    await vi.advanceTimersByTimeAsync(times.shows[0]!)
    await tick()
    expect(placed()).toBe('Woox (you)')
    expect(trophy()).toBe(trophyArt('platinum').url)

    await vi.advanceTimersByTimeAsync(times.shows[1]! - times.shows[0]!)
    await tick()
    expect(placed()).toBe('Zezima')
    expect(trophy()).toBe(trophyArt('diamond').url)
    expect(document.querySelector('.beside .confetti')).not.toBeNull()

    await vi.advanceTimersByTimeAsync(times.end - times.shows[1]! + CEREMONY.leave)
    await tick()
    expect(document.querySelectorAll('.hiscores tbody tr')).toHaveLength(3)
    expect(trophy()).toBeNull()
    expect(screen.getByRole('button', { name: 'Home' })).toBeTruthy()
  })

  it('skips to the hiscores', async () => {
    render(FinalStandings, { standings: TWO, youId: null, ceremony: true, children })
    await fireEvent.click(screen.getByRole('button', { name: 'Skip to the hiscores' }))
    await vi.advanceTimersByTimeAsync(CEREMONY.leave)
    await tick()
    expect(document.querySelector('.hiscores')).not.toBeNull()
  })

  it('shows a past game’s hiscores straight away, the totals alone, with the winner congratulated', () => {
    render(FinalStandings, { standings: TWO, youId: null, past: true, children })
    expect(document.querySelectorAll('.hiscores tbody tr')).toHaveLength(3)
    expect(document.querySelector('.gain')).toBeNull()
    expect(screen.getByText('Gz, Zezima! Here are the full hiscores.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Skip to the hiscores' })).toBeNull()
  })

  it('has no ceremony for a room where nobody scored', () => {
    const quiet = [standing('Zezima', 0, 1), standing('Woox', 0, 1)]
    render(FinalStandings, { standings: quiet, youId: null, ceremony: true, children })
    expect(document.querySelector('.hiscores')).not.toBeNull()
    expect(screen.getByText('Nobody scored. A quiet night at the inn.')).toBeTruthy()
  })

  describe('in a team game', () => {
    const TEAMS: TeamStanding[] = [
      { team: 'zamorak', points: 650, rank: 1, points_gained: 650, previous_rank: null },
      { team: 'saradomin', points: 400, rank: 2, points_gained: 400, previous_rank: null },
    ]
    const teamOf: Record<string, TeamId> = { Zezima: 'zamorak', Woox: 'saradomin', Lynx: 'zamorak' }
    const rows = (selector: string) =>
      [...document.querySelectorAll(selector)].map((el) =>
        el.textContent?.replace(/\s+/g, ' ').trim(),
      )

    it('ranks the teams with their members and points under each, and names the winner', () => {
      render(FinalStandings, {
        standings: TWO,
        teamStandings: TEAMS,
        teamOf,
        youId: 'Woox',
        past: true,
        children,
      })
      expect(document.querySelector('.hiscores')).toBeNull()
      expect(rows('.team .head .name')).toEqual(['Zamorak', 'Saradomin'])
      expect(rows('.team .head .total')).toEqual(['650 points', '400 points'])
      expect(rows(".team[data-team='zamorak'] .members li")).toEqual(['Zezima 900', 'Lynx 0'])
      expect(rows(".team[data-team='saradomin'] .members li")).toEqual(['Woox (you) 400'])
      expect(screen.getByText('Zamorak wins!')).toBeTruthy()
    })

    it('names both teams on a tie for first', () => {
      const tied = TEAMS.map((row) => ({ ...row, points: 500, rank: 1 }))
      render(FinalStandings, {
        standings: TWO,
        teamStandings: tied,
        teamOf,
        youId: null,
        past: true,
        children,
      })
      expect(screen.getByText('Zamorak and Saradomin win!')).toBeTruthy()
    })

    it('names the winner after the ceremony', async () => {
      render(FinalStandings, {
        standings: TWO,
        teamStandings: TEAMS,
        teamOf,
        youId: null,
        ceremony: true,
        children,
      })
      await fireEvent.click(screen.getByRole('button', { name: 'Skip to the hiscores' }))
      await vi.advanceTimersByTimeAsync(CEREMONY.leave)
      await tick()
      expect(document.querySelectorAll('.team')).toHaveLength(2)
      expect(document.querySelector('.says')?.textContent).toContain('Zamorak wins!')
    })
  })
})
