/** The Roster tab: the items read whole, renames and removals queued, then download and applied. */

import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as admin from '../../lib/admin'
import type { RosterChange, RosterItem } from '../../lib/rosterEdits'
import RosterItems from './RosterItems.svelte'

vi.mock('../../lib/admin', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../lib/admin')>()
  return {
    ...real,
    getRosterItems: vi.fn(),
    getRosterChanges: vi.fn(),
    renameRosterItem: vi.fn(),
    removeRosterItem: vi.fn(),
    discardRosterChange: vi.fn(),
    exportRosterChanges: vi.fn(),
    markRosterChangesApplied: vi.fn(),
    downloadJson: vi.fn(),
  }
})

const WHIP: RosterItem = { id: 4151, name: 'Abyssal whip' }
const MAUL: RosterItem = { id: 4153, name: '<b>Granite</b> maul' }

function change(over: Partial<RosterChange> = {}): RosterChange {
  return {
    item_id: WHIP.id,
    action: 'rename',
    name: 'Abyssal tentacle',
    before: WHIP.name,
    updated_at: '2026-10-05T10:00:00Z',
    exported_at: null,
    in_roster: true,
    ...over,
  }
}

function show(changes: RosterChange[] = []): void {
  vi.mocked(admin.getRosterChanges).mockResolvedValue(changes)
  render(RosterItems, { token: 't', onrefused: vi.fn() })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(admin.getRosterItems).mockResolvedValue([WHIP, MAUL])
  vi.mocked(admin.renameRosterItem).mockResolvedValue(change())
  vi.mocked(admin.removeRosterItem).mockResolvedValue(change({ action: 'remove', name: null }))
  vi.mocked(admin.discardRosterChange).mockResolvedValue()
  vi.mocked(admin.exportRosterChanges).mockResolvedValue({ renames: [], removes: [] })
  vi.mocked(admin.markRosterChangesApplied).mockResolvedValue(1)
})

afterEach(() => cleanup())

describe('RosterItems', () => {
  it('lists the items as text and searches them', async () => {
    show()
    expect(await screen.findByText('<b>Granite</b> maul')).toBeTruthy()
    expect(document.querySelector('b')).toBeNull()
    await fireEvent.input(screen.getByLabelText('Search'), { target: { value: 'whip' } })
    expect(screen.queryByText('<b>Granite</b> maul')).toBeNull()
    expect(screen.getByText('Abyssal whip')).toBeTruthy()
  })

  it('queues a rename under the item’s id, trimmed', async () => {
    show()
    await fireEvent.click(await screen.findByText('Abyssal whip'))
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Abyssal whip')
    await fireEvent.input(screen.getByLabelText('Name'), { target: { value: ' Abyssal tentacle ' } })
    await fireEvent.click(screen.getByRole('button', { name: 'Queue the rename' }))
    expect(admin.renameRosterItem).toHaveBeenCalledWith('t', WHIP.id, 'Abyssal tentacle')
  })

  it('refuses a name another item has before anything is sent', async () => {
    show()
    await fireEvent.click(await screen.findByText('Abyssal whip'))
    await fireEvent.input(screen.getByLabelText('Name'), { target: { value: '<B>granite</B> MAUL' } })
    await fireEvent.click(screen.getByRole('button', { name: 'Queue the rename' }))
    expect(screen.getByText('Another item has that name.')).toBeTruthy()
    expect(admin.renameRosterItem).not.toHaveBeenCalled()
  })

  it('queues a removal', async () => {
    show()
    await fireEvent.click(await screen.findByText('Abyssal whip'))
    await fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    expect(admin.removeRosterItem).toHaveBeenCalledWith('t', WHIP.id)
  })

  it('shows a pending change on its item and in the list, and discards it', async () => {
    show([change()])
    const pending = await screen.findByRole('region', { name: 'Pending changes' })
    expect(within(pending).getByText(/Abyssal whip → Abyssal tentacle/)).toBeTruthy()
    expect(screen.getByText('Renamed to Abyssal tentacle')).toBeTruthy()
    await fireEvent.click(within(pending).getByRole('button', { name: 'Discard' }))
    expect(admin.discardRosterChange).toHaveBeenCalledWith('t', WHIP.id)
  })

  it('renames again from the pending name', async () => {
    show([change()])
    await fireEvent.click(await screen.findByText('Abyssal whip'))
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Abyssal tentacle')
  })

  it('downloads the changes, then marks the downloaded ones applied', async () => {
    show([change(), change({ item_id: MAUL.id, action: 'remove', name: null, before: MAUL.name })])
    await fireEvent.click(await screen.findByRole('button', { name: 'Download 2 changes' }))
    expect(admin.exportRosterChanges).toHaveBeenCalledWith('t')
    expect(admin.downloadJson).toHaveBeenCalledWith(
      { renames: [], removes: [] },
      expect.stringMatching(/^roster-changes-\d{4}-\d{2}-\d{2}\.json$/),
    )
    cleanup()
    show([change({ exported_at: '2026-10-05T11:00:00Z' })])
    await fireEvent.click(await screen.findByRole('button', { name: 'Mark 1 as applied' }))
    expect(admin.markRosterChangesApplied).toHaveBeenCalledWith('t')
  })

  it('says when a change names an item the roster no longer holds', async () => {
    show([change({ in_roster: false })])
    expect(await screen.findByText('No longer on the roster')).toBeTruthy()
  })
})
