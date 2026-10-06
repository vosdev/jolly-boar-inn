import { describe, expect, it } from 'vitest'

import { renameProblem, rosterChangesFileName, searchItems, type RosterItem } from './rosterEdits'

const ROSTER: RosterItem[] = [
  { id: 4151, name: 'Abyssal whip' },
  { id: 13263, name: 'Abyssal bludgeon' },
  { id: 4153, name: 'Granite maul' },
  { id: 6571, name: 'Uncut onyx' },
]

describe('searchItems', () => {
  it('finds names holding every word, ignoring case and accents', () => {
    expect(searchItems(ROSTER, 'ABYSSAL w').map((item) => item.id)).toEqual([4151])
    expect(searchItems(ROSTER, 'ónyx').map((item) => item.id)).toEqual([6571])
  })

  it('lists everything for an empty search', () => {
    expect(searchItems(ROSTER, '  ')).toEqual(ROSTER)
  })
})

describe('renameProblem', () => {
  const whip = ROSTER[0] as RosterItem

  it('accepts a new name', () => {
    expect(renameProblem(whip, ' Abyssal tentacle ', ROSTER)).toBeNull()
  })

  it('refuses what the server would', () => {
    expect(renameProblem(whip, '   ', ROSTER)).toBe('Give it a name.')
    expect(renameProblem(whip, 'x'.repeat(81), ROSTER)).toBe('At most 80 characters.')
    expect(renameProblem(whip, 'Abyssal whip', ROSTER)).toBe('That is the name it has.')
    expect(renameProblem(whip, 'GRANITE MAUL', ROSTER)).toBe('Another item has that name.')
  })
})

describe('rosterChangesFileName', () => {
  it('is dated', () => {
    expect(rosterChangesFileName(new Date('2026-10-06T12:00:00Z'))).toBe('roster-changes-2026-10-06.json')
  })
})
