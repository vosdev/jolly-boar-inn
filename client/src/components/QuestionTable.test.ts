/** The table panel through a question: halves, teams, the TV, a host-only question, a phone. */

import { fireEvent, render, screen, within } from '@testing-library/svelte'
import { describe, expect, it } from 'vitest'

import type { PlayerView } from '../lib/protocol'
import QuestionTable from './QuestionTable.svelte'

function player(id: string, name: string, patch: Partial<PlayerView> = {}): PlayerView {
  return {
    id,
    display_name: name,
    avatar: null,
    role: 'player',
    team: null,
    connected: true,
    ready: false,
    editing: false,
    item: null,
    ...patch,
  }
}

function names(label: string): string[] {
  return within(screen.getByRole('list', { name: label }))
    .getAllByRole('listitem')
    .map((item) => item.querySelector('.pet-name')?.textContent ?? '')
}

const PLAYERS = [
  player('a', 'Zezima', { team: 'zamorak' }),
  player('b', 'Woox', { team: 'saradomin' }),
  player('c', 'Lynx', { team: 'zamorak' }),
  player('tv', 'Lounge', { role: 'tv' }),
]

describe('QuestionTable', () => {
  it('groups each half by team in a team game, in god order', () => {
    render(QuestionTable, {
      players: PLAYERS,
      youId: 'a',
      questionId: 'q1',
      waiting: ['a'],
      teams: ['zamorak', 'saradomin'],
    })
    expect(names('Answered, Saradomin')).toEqual(['Woox'])
    expect(names('Answered, Zamorak')).toEqual(['Lynx'])
    expect(names('Still thinking, Zamorak')).toEqual(['Zezima'])
    expect(
      screen
        .getAllByRole('list')
        .map((list) => list.getAttribute('aria-label'))
        .filter((label) => label !== 'TV'),
    ).toEqual(['Answered, Saradomin', 'Answered, Zamorak', 'Still thinking, Zamorak'])
  })

  it('lists the TV under its own heading, never answered or thinking', () => {
    render(QuestionTable, { players: PLAYERS, youId: 'a', questionId: 'q1', waiting: [] })
    expect(names('TV')).toEqual(['Lounge'])
    expect(names('Answered')).toEqual(['Zezima', 'Woox', 'Lynx'])
    expect(screen.queryByRole('list', { name: 'Still thinking' })).toBeNull()
  })

  it('lists everyone together for a question nobody answers', () => {
    render(QuestionTable, {
      players: PLAYERS,
      youId: 'a',
      questionId: 'q1',
      waiting: [],
      hostOnly: true,
    })
    expect(names('At the table')).toEqual(['Zezima', 'Woox', 'Lynx'])
    expect(screen.queryByRole('list', { name: 'Answered' })).toBeNull()
  })

  it('opens from a phone’s strip as a sheet, and a new question closes it', async () => {
    const { rerender } = render(QuestionTable, {
      players: PLAYERS,
      youId: 'a',
      questionId: 'q1',
      waiting: ['a', 'c'],
      stacked: true,
    })
    const strip = screen.getByRole('button', { name: '1 of 3 answered' })
    expect(strip.querySelectorAll('.face')).toHaveLength(3)
    expect(strip.querySelectorAll('.face.dim')).toHaveLength(2)
    await fireEvent.click(strip)
    const sheet = screen.getByRole('dialog', { name: 'At the table' })
    expect(within(sheet).getByRole('list', { name: 'Answered' }).textContent).toContain('Woox')
    await fireEvent.click(within(sheet).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    await fireEvent.click(strip)
    await rerender({ questionId: 'q2', waiting: ['a', 'b', 'c'] })
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
