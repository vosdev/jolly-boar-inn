/** The table panel through a question: halves, teams, the TV, a host-only question, a phone. */

import { fireEvent, render, screen, within } from '@testing-library/svelte'
import { describe, expect, it, vi } from 'vitest'

import type { OpenQuestion, PlayerView } from '../lib/protocol'
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

describe('QuestionTable items', () => {
  const ring = { id: 'ring_of_life', charges: null }

  it('shows a worn item on its pet’s shoulder, and nothing once its round is over', async () => {
    const { container, rerender } = render(QuestionTable, {
      players: [player('a', 'Zezima', { item: ring }), player('b', 'Woox')],
      youId: 'b',
      questionId: 'q1',
      waiting: ['a', 'b'],
    })
    const worn = container.querySelectorAll('.table-pet .worn')
    expect(worn).toHaveLength(1)
    expect(worn[0]?.closest('.table-pet')?.textContent).toContain('Zezima')
    expect(worn[0]?.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe('Ring of Life')

    await rerender({ players: [player('a', 'Zezima'), player('b', 'Woox')], questionId: 'q2' })
    expect(container.querySelector('.worn')).toBeNull()
  })

  it('heads the panel with your item, what it does and when it goes', () => {
    render(QuestionTable, {
      players: [player('a', 'Zezima', { item: { id: 'super_restore', charges: 3 } })],
      youId: 'a',
      questionId: 'q1',
      waiting: ['a'],
    })
    const slot = screen.getByRole('region', { name: 'Your item' })
    expect(slot.textContent).toContain('Super restore (3)')
    expect(slot.textContent).toContain('speed question')
    expect(slot.textContent).toContain('Gone after this round')
  })

  it('is a square at the strip’s end on a phone, which opens what it does', async () => {
    render(QuestionTable, {
      players: [player('a', 'Zezima', { item: ring })],
      youId: 'a',
      questionId: 'q1',
      waiting: ['a'],
      stacked: true,
    })
    expect(screen.queryByRole('region', { name: 'Your item' })).toBeNull()
    await fireEvent.click(screen.getByRole('button', { name: 'Ring of Life: what it does' }))
    expect(screen.getByRole('dialog').textContent).toContain('Saves you once')
  })
})

describe('QuestionTable used items', () => {
  const PAST = new Date(Date.now() - 1000).toISOString()

  function question(patch: Partial<OpenQuestion> = {}): OpenQuestion {
    return {
      question_id: 'q1',
      index: 0,
      total: 2,
      type: 'multiple_choice',
      mode: 'bestiary',
      segment: { mode: 'bestiary', index: 0, total: 1, start: 0, count: 2 },
      view: { prompt: 'Which?', options: ['a', 'b'] },
      picture: null,
      random_event: null,
      opened_at: PAST,
      answerable_at: PAST,
      ends_at: new Date(Date.now() + 10_000).toISOString(),
      you_can_answer: true,
      answered: 0,
      of: 1,
      waiting: ['a'],
      item_used: false,
      removed: [],
      ...patch,
    }
  }

  function table(item: string | null, patch: Record<string, unknown> = {}) {
    const onUse = vi.fn()
    const rendered = render(QuestionTable, {
      players: [
        player('a', 'Zezima', { item: item === null ? null : { id: item, charges: null } }),
      ],
      youId: 'a',
      questionId: 'q1',
      waiting: ['a'],
      openQuestion: question(),
      onUse,
      ...patch,
    })
    return { ...rendered, onUse }
  }

  it('puts the button under the slot, and one tap uses the item', async () => {
    const { onUse } = table('xp_lamp')
    const slot = screen.getByRole('region', { name: 'Your item' })
    expect(slot.textContent).toContain(
      'Rub it before you answer to double your points on this question.',
    )
    await fireEvent.click(screen.getByRole('button', { name: 'Rub it' }))
    expect(onUse).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: 'Rub it' })).toBeNull()
  })

  it('shows the button only with an item you use, while it can be used', () => {
    for (const [item, patch] of [
      [null, {}],
      ['ring_of_life', {}],
      ['xp_lamp', { answered: true }],
      ['ring_of_charos', { openQuestion: question({ type: 'more_less', mode: 'more_less' }) }],
      ['book_of_knowledge', { openQuestion: question({ you_can_answer: false }) }],
      ['kebab', { openQuestion: null }],
      ['kebab', { used: 'kebab' }],
      [
        'kebab',
        { openQuestion: question({ answerable_at: new Date(Date.now() + 60_000).toISOString() }) },
      ],
    ] as const) {
      const { unmount } = table(item, patch)
      expect(
        screen.queryByRole('button', { name: /Eat it|Charm the host|Open the book|Rub it/ }),
      ).toBeNull()
      unmount()
    }
    for (const [item, label, patch] of [
      ['kebab', 'Eat it', { answered: true }],
      ['ring_of_charos', 'Charm the host', {}],
      ['book_of_knowledge', 'Open the book', {}],
      ['xp_lamp', 'Rub it', {}],
    ] as const) {
      const { unmount } = table(item, patch)
      expect(screen.getByRole('button', { name: label })).toBeTruthy()
      unmount()
    }
  })

  it('says what a used item did in its line’s place, through the reveal', () => {
    table(null, { used: 'kebab', openQuestion: null, results: {} })
    const slot = screen.getByRole('region', { name: 'Your item' })
    expect(slot.textContent).toContain('Eaten! +300 points on this question.')
  })

  it('puts the item and its button in a bar over the strip on a phone', async () => {
    const { onUse } = table('kebab', { stacked: true })
    const button = screen.getByRole('button', { name: 'Eat it' })
    expect(button.closest('.item-bar')?.textContent).toContain('Kebab')
    await fireEvent.click(button)
    expect(onUse).toHaveBeenCalledTimes(1)
  })

  it('keeps the phone’s bar saying what the item did once used', () => {
    const { container } = table('book_of_knowledge', { stacked: true, used: 'book_of_knowledge' })
    expect(container.querySelector('.item-bar')?.textContent).toContain(
      'The book answered for you.',
    )
    expect(screen.queryByRole('button', { name: 'Open the book' })).toBeNull()
  })
})
