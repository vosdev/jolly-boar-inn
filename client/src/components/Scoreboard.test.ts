/**
 * D9: the podium and the hiscores as one component, between rounds and on the final
 * screen. The arranging is `lib/podium.ts`'s and tested there; this is what reaches the
 * page: the steps in order, the full name in each step's label, the table's rows, and a
 * placeholder trophy that is drawn rather than missing.
 */

import { render, screen, within } from '@testing-library/svelte'
import { beforeEach, describe, expect, it } from 'vitest'

import type { Standing } from '../lib/protocol'
import { players } from '../lib/stores'
import Scoreboard from './Scoreboard.svelte'

const LONG = 'Cow31337Killer42Forever1' // 24 characters, the longest a name may be

function standing(name: string, points: number, rank: number): Standing {
  return { player_id: name, display_name: name, avatar: null, points, rank }
}

const EIGHT = [
  standing(LONG, 8420, 1),
  standing('ScapeRune', 7115, 2),
  standing('AlchAddict', 6980, 3),
  standing('xX_Lumby', 5210, 4),
  standing('NoobSlayer', 4870, 5),
  standing('PurePkr2006', 4410, 6),
  standing('BankStander', 3905, 7),
  standing('Zezima', 0, 8),
]

beforeEach(() => players.set([]))

function steps(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>('.podium > li')]
}

describe('Scoreboard', () => {
  it('stands ranks 4 · 2 · 1 · 3 · 5 from left to right', () => {
    const { container } = render(Scoreboard, { standings: EIGHT })
    expect(steps(container).map((step) => step.dataset.rank)).toEqual(['4', '2', '1', '3', '5'])
    const tiers = steps(container).map((step) => step.querySelector('.tier')?.textContent)
    expect(tiers).toEqual(['Silver', 'Platinum', 'Diamond', 'Gold', 'Bronze'])
  })

  it('says each step in full, a 24-character name included', () => {
    const { container } = render(Scoreboard, { standings: EIGHT })
    const first = steps(container)[2]!
    expect(first.querySelector('.sr')?.textContent).toBe(
      `1st, Diamond trophy: ${LONG}, 8,420 points`,
    )
  })

  it('between rounds lists everyone below the podium, and pins your own row', () => {
    render(Scoreboard, { standings: EIGHT, youId: 'BankStander' })
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1)
    expect(rows.map((row) => row.querySelector('.rank')?.textContent)).toEqual(['6', '7', '8'])
    const yours = rows.find((row) => row.textContent?.includes('BankStander'))
    expect(yours?.classList.contains('pinned')).toBe(true)
    expect(rows.filter((row) => row.classList.contains('pinned'))).toHaveLength(1)
  })

  it('on the final screen lists everyone, the whole long name in its row', () => {
    render(Scoreboard, { standings: EIGHT, youId: 'BankStander', final: true })
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(8)
    expect(rows[0]!.textContent).toContain(LONG)
    expect(rows.some((row) => row.classList.contains('pinned'))).toBe(false)
  })

  it('shows a tie on one step with +N past three heads', () => {
    const level = ['a', 'b', 'c', 'd', 'e'].map((name) => standing(name, 500, 1))
    const { container } = render(Scoreboard, { standings: level })
    const first = steps(container)[2]!
    expect(first.querySelectorAll('.heads .head')).toHaveLength(3)
    expect(first.querySelector('.more')?.textContent).toBe('+2')
    expect(steps(container).filter((step) => step.classList.contains('empty'))).toHaveLength(4)
  })

  it('stands nobody on 0 points on the podium, and dims the trophies nobody earned', () => {
    const quiet = [standing('a', 0, 1), standing('b', 0, 1)]
    const { container } = render(Scoreboard, { standings: quiet })
    expect(steps(container).every((step) => step.classList.contains('empty'))).toBe(true)
    expect(container.querySelectorAll('.podium .head')).toHaveLength(0)
    expect(steps(container)[2]!.querySelector('.sr')?.textContent).toBe('1st, Diamond trophy: nobody')
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(3)
  })

  it('draws a placeholder cup for a trophy with no render, not a broken image', () => {
    const { container } = render(Scoreboard, { standings: EIGHT })
    const trophies = [...container.querySelectorAll('.trophy')]
    expect(trophies).toHaveLength(5)
    for (const trophy of trophies) {
      expect(trophy.classList.contains('placeholder')).toBe(true)
      // A file URL, or inlined by Vite as a data URL, which the CSP's img-src allows.
      expect(trophy.querySelector('img')?.getAttribute('src')).toMatch(/^data:image\/svg|\.svg$/)
    }
  })

  it('carries no medals', () => {
    const { container } = render(Scoreboard, { standings: EIGHT, final: true })
    expect(container.textContent).not.toMatch(/🥇|🥈|🥉/)
  })

  it('takes a renamed player from the live list without moving them', () => {
    players.set([{ id: 'PurePkr2006', display_name: 'Renamed', role: 'player', connected: true }])
    render(Scoreboard, { standings: EIGHT })
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1)
    expect(rows[0]!.textContent).toContain('Renamed')
    expect(rows[0]!.querySelector('.rank')?.textContent).toBe('6')
  })
})
