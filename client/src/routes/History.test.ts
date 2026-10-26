/** A past game opened from this browser's history, after the room behind it has gone. */

import { cleanup, fireEvent, render, screen } from '@testing-library/svelte'
import { get } from 'svelte/store'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { barPast } from '../lib/barWhere'
import { historyStamp, savePastGame } from '../lib/history'
import { roomShown } from '../lib/roomFit'
import type { Standing } from '../lib/protocol'
import { players } from '../lib/stores'
import History from './History.svelte'

const FINISHED = '2026-10-01T20:05:00Z'

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

const STANDINGS = [standing('Zezima', 900, 1), standing('Woox', 400, 2), standing('Lynx', 100, 3)]

const root = document.documentElement

/** A window `width` px wide: from 1024px the page takes the room's desktop frame. */
function windowOf(width: number): void {
  Object.defineProperty(root, 'clientWidth', { configurable: true, value: width })
}

beforeEach(() => {
  localStorage.clear()
  players.set([])
})

afterEach(() => {
  cleanup()
  delete (root as { clientWidth?: number }).clientWidth
})

describe('History', () => {
  it('reopens a team game as one, from what this browser filed', () => {
    savePastGame({
      code: 'Abyssal',
      finishedAt: FINISHED,
      standings: STANDINGS,
      youId: 'Woox',
      teamStandings: [
        { team: 'armadyl', points: 650, rank: 1, points_gained: 300, previous_rank: 2 },
        { team: 'zaros', points: 100, rank: 2, points_gained: 0, previous_rank: 1 },
      ],
      teams: { Zezima: 'armadyl', Woox: 'armadyl', Lynx: 'zaros' },
    })
    render(History, { code: 'ABYSSAL', stamp: historyStamp(FINISHED), navigate: vi.fn() })
    const names = [...document.querySelectorAll('.team .head .name')].map((el) => el.textContent)
    expect(names).toEqual(['Armadyl', 'Zaros'])
    expect(document.querySelectorAll(".team[data-team='armadyl'] .members li")).toHaveLength(2)
    expect(document.querySelector('.gain')).toBeNull()
    expect(screen.getByText('Armadyl wins!')).toBeTruthy()
  })

  it('reopens a normal game as the player hiscores', () => {
    savePastGame({ code: 'Abyssal', finishedAt: FINISHED, standings: STANDINGS, youId: null })
    render(History, { code: 'ABYSSAL', stamp: historyStamp(FINISHED), navigate: vi.fn() })
    expect(document.querySelectorAll('.hiscores tbody tr')).toHaveLength(3)
    expect(document.querySelector('.team-hiscores')).toBeNull()
  })

  it('has the Wise Old Man say the closing line above the whole table at once', () => {
    savePastGame({ code: 'Abyssal', finishedAt: FINISHED, standings: STANDINGS, youId: null })
    render(History, { code: 'Abyssal', stamp: historyStamp(FINISHED), navigate: vi.fn() })
    const box = document.querySelector('.speech')!
    expect(box.textContent).toContain('Wise Old Man')
    expect(box.textContent).toContain('Gz, Zezima! Here are the full hiscores.')
    expect(document.querySelectorAll('.hiscores tbody tr')).toHaveLength(3)
    expect(screen.queryByRole('button', { name: /skip/i })).toBeNull()
    expect(screen.queryByText(/The room has closed/)).toBeNull()
  })

  it('shows rank, name and points on one line on the desktop, and two-line rows on a phone', () => {
    savePastGame({ code: 'Abyssal', finishedAt: FINISHED, standings: STANDINGS, youId: null })
    windowOf(1512)
    render(History, { code: 'Abyssal', stamp: historyStamp(FINISHED), navigate: vi.fn() })
    expect(document.querySelector('.frame.fitted .play.final')).toBeTruthy()
    expect(get(roomShown)).not.toBeNull()
    const heads = [...document.querySelectorAll('.hiscores.columns thead th')].map((th) =>
      th.textContent?.trim(),
    )
    expect(heads).toEqual(['Rank', 'Name', 'Points'])
    cleanup()
    windowOf(390)
    render(History, { code: 'Abyssal', stamp: historyStamp(FINISHED), navigate: vi.fn() })
    expect(document.querySelector('.frame.fitted')).toBeNull()
    expect(document.querySelector('.hiscores')).toBeTruthy()
    expect(document.querySelector('.hiscores.columns')).toBeNull()
  })

  it('gives the bar the room and when it finished, and takes them back on leaving', () => {
    savePastGame({ code: 'Abyssal', finishedAt: FINISHED, standings: STANDINGS, youId: null })
    const { unmount } = render(History, {
      code: 'ABYSSAL',
      stamp: historyStamp(FINISHED),
      navigate: vi.fn(),
    })
    expect(get(barPast)).toEqual({ code: 'Abyssal', finishedAt: FINISHED })
    unmount()
    expect(get(barPast)).toBeNull()
  })

  it('names the team game’s winners in the box and drops the empty columns on the desktop', () => {
    savePastGame({
      code: 'Abyssal',
      finishedAt: FINISHED,
      standings: STANDINGS,
      youId: null,
      teamStandings: [
        { team: 'armadyl', points: 650, rank: 1, points_gained: 300, previous_rank: 2 },
        { team: 'zaros', points: 100, rank: 2, points_gained: 0, previous_rank: 1 },
      ],
      teams: { Zezima: 'armadyl', Woox: 'armadyl', Lynx: 'zaros' },
    })
    windowOf(1512)
    render(History, { code: 'Abyssal', stamp: historyStamp(FINISHED), navigate: vi.fn() })
    expect(document.querySelector('.speech')!.textContent).toContain('Armadyl wins!')
    expect(document.querySelector('.team-hiscores.columns.totals')).toBeTruthy()
    expect(document.querySelector('.team-hiscores .moved, .team-hiscores .round')).toBeNull()
  })

  it('names players as the game filed them, not as a room left earlier knows them', () => {
    savePastGame({ code: 'Abyssal', finishedAt: FINISHED, standings: STANDINGS, youId: null })
    players.set([
      {
        id: 'Zezima',
        display_name: 'Someone else',
        avatar: null,
        role: 'player',
        team: null,
        connected: true,
        ready: false,
        editing: false,
      },
    ])
    render(History, { code: 'Abyssal', stamp: historyStamp(FINISHED), navigate: vi.fn() })
    expect(screen.queryByText('Someone else')).toBeNull()
    expect(document.querySelector('.speech')!.textContent).toContain('Gz, Zezima!')
  })

  it('says it has no record of a game this browser never kept, and offers the way home', async () => {
    const navigate = vi.fn()
    render(History, { code: 'FireCape', stamp: '2610252014', navigate })
    expect(document.querySelector('.speech')!.textContent).toContain(
      "I've no record of that game. This browser kept no hiscores for it.",
    )
    expect(screen.getByRole('heading', { name: 'Room FireCape' })).toBeTruthy()
    expect(get(barPast)).toEqual({ code: 'FireCape', finishedAt: null })
    await fireEvent.click(screen.getByRole('button', { name: 'Home' }))
    expect(navigate).toHaveBeenCalledWith('/')
  })
})
