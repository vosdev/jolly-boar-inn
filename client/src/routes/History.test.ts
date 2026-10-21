/** A past game opened from this browser's history, after the room behind it has gone. */

import { render, screen } from '@testing-library/svelte'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { historyStamp, savePastGame } from '../lib/history'
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

beforeEach(() => {
  localStorage.clear()
  players.set([])
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
})
