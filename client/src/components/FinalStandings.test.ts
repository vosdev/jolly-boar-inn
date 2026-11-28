/**
 * The final screen: the Wise Old Man presents fifth place to first, each with its trophy
 * held up in his dialogue box, then the full hiscores; Skip goes straight there, and a past game or
 * a reload never plays the ceremony.
 */

import { fireEvent, render, screen } from '@testing-library/svelte'
import { createRawSnippet, tick } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CEREMONY, ceremonyTimes, FINAL_INTRO } from '../lib/hiscores'
import { trophyLine } from '../lib/modes'
import type { PlayerView, Standing, TeamStanding } from '../lib/protocol'
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
const SEED = 'Zezima:900,Woox:400,Lynx:0'
const LINES = [
  FINAL_INTRO,
  trophyLine(2, 'platinum', false, SEED),
  trophyLine(1, 'diamond', false, SEED),
]
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
  vi.unstubAllGlobals()
})

const placed = () => document.querySelector('.placed .names')?.textContent
const trophy = () => document.querySelector('.bubble .trophy img')?.getAttribute('src') ?? null
const speech = () => document.querySelector('.bubble .speech')?.textContent ?? ''

describe('FinalStandings', () => {
  it('presents second then first, each with its trophy, and then the full hiscores', async () => {
    render(FinalStandings, { standings: TWO, youId: 'Woox', ceremony: true, children })
    const times = ceremonyTimes(LINES.map((line) => [...line].length))
    expect(document.querySelector('.hiscores')).toBeNull()
    expect(screen.getByRole('button', { name: 'Skip to hiscores' })).toBeTruthy()

    await vi.advanceTimersByTimeAsync(times.shows[0]!)
    await tick()
    expect(speech()).toContain(LINES[1])
    expect(placed()).toBe('Woox (you)')
    expect(trophy()).toBe(trophyArt('platinum').url)

    await vi.advanceTimersByTimeAsync(times.shows[1]! - times.shows[0]!)
    await tick()
    expect(speech()).toContain(LINES[2])
    expect(placed()).toBe('Zezima')
    expect(trophy()).toBe(trophyArt('diamond').url)
    expect(document.querySelector('.bubble .trophy .confetti')).not.toBeNull()

    await vi.advanceTimersByTimeAsync(times.end - times.shows[1]! + CEREMONY.leave)
    await tick()
    expect(document.querySelectorAll('.hiscores tbody tr')).toHaveLength(3)
    expect(trophy()).toBeNull()
    expect(screen.getByRole('button', { name: 'Home' })).toBeTruthy()
  })

  it('holds the trophy up in his dialogue box from his line on, and never beside the scroll', async () => {
    const { container } = render(FinalStandings, {
      standings: TWO,
      youId: null,
      ceremony: true,
      children,
    })
    const times = ceremonyTimes(LINES.map((line) => [...line].length))
    await vi.advanceTimersByTimeAsync(times.lines[1]!)
    await tick()
    expect(placed()).toBeUndefined()
    expect(trophy()).toBe(trophyArt('platinum').url)
    expect(container.querySelectorAll('.trophy')).toHaveLength(1)
    expect(container.querySelector('.stage-row .trophy')).toBeNull()
    expect(container.querySelector('.beside')).toBeNull()
  })

  it("centres the Wise Old Man's line under his name", () => {
    const { container } = render(FinalStandings, {
      standings: TWO,
      youId: null,
      ceremony: true,
      children,
    })
    expect(container.querySelector('.bubble .stack.centred')).toBeTruthy()
  })

  it('skips to the hiscores', async () => {
    render(FinalStandings, { standings: TWO, youId: null, ceremony: true, children })
    await fireEvent.click(screen.getByRole('button', { name: 'Skip to hiscores' }))
    await vi.advanceTimersByTimeAsync(CEREMONY.leave)
    await tick()
    expect(document.querySelector('.hiscores')).not.toBeNull()
  })

  it('shows a past game’s hiscores straight away, the totals alone, with the winner congratulated', () => {
    render(FinalStandings, { standings: TWO, youId: null, past: true, children })
    expect(document.querySelectorAll('.hiscores tbody tr')).toHaveLength(3)
    expect(document.querySelector('.gain')).toBeNull()
    expect(screen.getByText('Gz, Zezima! Here are the full hiscores.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Skip to hiscores' })).toBeNull()
  })

  it('says his lines in his bubble and shows no Next up', () => {
    render(FinalStandings, { standings: TWO, youId: 'Woox', children })
    expect(document.querySelector('.bubble .speech')?.textContent).toContain('Gz, Zezima!')
    expect(screen.queryByRole('region', { name: 'Next up' })).toBeNull()
    expect(screen.queryByText('Next up')).toBeNull()
  })

  it('has no ceremony for a room where nobody scored', () => {
    const quiet = [standing('Zezima', 0, 1), standing('Woox', 0, 1)]
    render(FinalStandings, { standings: quiet, youId: null, ceremony: true, children })
    expect(document.querySelector('.hiscores')).not.toBeNull()
    expect(
      screen.getByText("Nobody scored. I guess they didn't really know Gielinor after all."),
    ).toBeTruthy()
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

    it('presents the teams, not the players, with no trophy', async () => {
      render(FinalStandings, {
        standings: TWO,
        teamStandings: TEAMS,
        teamOf,
        youId: null,
        ceremony: true,
        children,
      })
      const times = ceremonyTimes(
        [FINAL_INTRO, 'So close! In second…', 'And top of the hiscores…'].map(
          (line) => [...line].length,
        ),
      )
      expect(document.querySelector('.prize')).toBeNull()
      await vi.advanceTimersByTimeAsync(times.shows[0]!)
      await tick()
      expect(placed()).toBe('Saradomin')
      expect(document.querySelector('.placed .points')?.textContent).toMatch(/400 points/)
      expect(document.querySelector('.placed .logo')?.getAttribute('data-team')).toBe('saradomin')

      await vi.advanceTimersByTimeAsync(times.shows[1]! - times.shows[0]!)
      await tick()
      expect(placed()).toBe('Zamorak')
      expect(document.querySelector('.trophy')).toBeNull()
      expect(document.querySelector('.placed .logos .confetti')).not.toBeNull()
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
      await fireEvent.click(screen.getByRole('button', { name: 'Skip to hiscores' }))
      await vi.advanceTimersByTimeAsync(CEREMONY.leave)
      await tick()
      expect(document.querySelectorAll('.team')).toHaveLength(2)
      expect(document.querySelector('.bubble .speech')?.textContent).toContain('Zamorak wins!')
    })
  })
})

describe('FinalStandings share text', () => {
  const FOUR = [
    standing('Zezima', 900, 1),
    standing('Woox', 400, 2),
    standing('Lynx', 100, 3),
    standing('Mod Ash', 0, 4),
  ]
  const PLAYER: PlayerView = {
    id: '',
    display_name: '',
    role: 'player',
    connected: true,
    avatar: null,
    ready: false,
    editing: false,
    team: null,
    item: null,
  }

  function clipboard(write: () => Promise<void>) {
    const writeText = vi.fn<(text: string) => Promise<void>>(write)
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    return writeText
  }

  it('copies the top three, with the room’s current names', async () => {
    players.set([{ ...PLAYER, id: 'Zezima', display_name: 'Zezima the Great' }])
    const writeText = clipboard(() => Promise.resolve())
    render(FinalStandings, { standings: FOUR, youId: 'Mod Ash', past: true, children })
    await fireEvent.click(screen.getByRole('button', { name: 'Copy top 3 results' }))
    expect(writeText).toHaveBeenCalledWith(
      [
        'Quiz night at The Jolly Boar Inn: 4 players.',
        '🥇 Zezima the Great 900',
        '🥈 Woox 400',
        '🥉 Lynx 100',
        'I came 4th with 0. Think you can beat us?',
        location.origin,
      ].join('\n'),
    )
    await screen.findByRole('button', { name: 'Copied' })
    expect(screen.getByRole('button', { name: 'Copy full results' })).toBeTruthy()
  })

  it('copies everyone when asked', async () => {
    const writeText = clipboard(() => Promise.resolve())
    render(FinalStandings, { standings: FOUR, youId: 'Mod Ash', past: true, children })
    await fireEvent.click(screen.getByRole('button', { name: 'Copy full results' }))
    expect(writeText.mock.lastCall?.[0]).toContain('🥉 Lynx 100\n4. Mod Ash 0\nThink you can')
  })

  it('offers the gods alone or with their players in a team game', async () => {
    const writeText = clipboard(() => Promise.resolve())
    render(FinalStandings, {
      standings: TWO,
      teamStandings: [
        { team: 'zamorak', points: 450, rank: 1, points_gained: 0, previous_rank: null },
        { team: 'saradomin', points: 400, rank: 2, points_gained: 0, previous_rank: null },
      ],
      teamOf: { Zezima: 'zamorak', Lynx: 'zamorak', Woox: 'saradomin' },
      youId: 'Woox',
      past: true,
      children,
    })
    await fireEvent.click(screen.getByRole('button', { name: 'Copy gods and players' }))
    expect(writeText.mock.lastCall?.[0]).toContain(
      '🥇 Zamorak 450 avg\n   Zezima 900 · Lynx 0\n🥈 Saradomin 400 avg\n   Woox 400',
    )
    expect(screen.getByRole('button', { name: 'Copy gods' })).toBeTruthy()
  })

  it('shows the text to copy by hand when the clipboard refuses', async () => {
    clipboard(() => Promise.reject(new Error('denied')))
    render(FinalStandings, { standings: TWO, youId: null, past: true, children })
    await fireEvent.click(screen.getByRole('button', { name: 'Copy top 3 results' }))
    const field = await screen.findByRole<HTMLTextAreaElement>('textbox', { name: 'The result' })
    expect(field.value).toContain('🥇 Zezima 900')
  })
})

describe('FinalStandings on the TV', () => {
  it('plays the ceremony with no Skip, then the hiscores with nothing under them', async () => {
    const { container } = render(FinalStandings, {
      standings: TWO,
      youId: null,
      ceremony: true,
      tv: true,
      children,
    })
    expect(container.querySelector('.stage.tv.wide')).not.toBeNull()
    expect(screen.queryByRole('button', { name: 'Skip to hiscores' })).toBeNull()
    await vi.runAllTimersAsync()
    expect(screen.getByRole('table')).toBeTruthy()
    expect(screen.queryAllByRole('button')).toEqual([])
  })

  it('holds the trophy up beside his line at the sheet’s head', async () => {
    render(FinalStandings, { standings: TWO, youId: null, ceremony: true, tv: true, children })
    const times = ceremonyTimes(LINES.map((line) => [...line].length))
    await vi.advanceTimersByTimeAsync(times.shows[0]!)
    await tick()
    expect(document.querySelector('.head .says')?.textContent).toContain(LINES[1])
    expect(document.querySelector('.head .trophy img')?.getAttribute('src')).toBe(
      trophyArt('platinum').url,
    )
  })
})
