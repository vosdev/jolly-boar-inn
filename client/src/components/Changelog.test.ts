/** The What's new sheet: minors newest first, their patches nested, and a way out. */

import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { asOfDate } from '../lib/dates'
import { RELEASES_URL } from '../lib/links'
import Changelog from './Changelog.svelte'

vi.mock('../lib/changelog', async (importOriginal) => {
  const real = await importOriginal<typeof import('../lib/changelog')>()
  return {
    ...real,
    CHANGELOG: [
      { version: '0.11.0', date: '2026-09-26', text: 'Five rooms at once.' },
      { version: '0.10.2', date: '2026-09-26', text: 'A build fix.' },
      { version: '0.10.1', date: '2026-09-26', text: 'Our own machines.' },
      { version: '0.10.0', date: '2026-09-25', text: 'A footer.' },
    ],
  }
})

afterEach(() => {
  cleanup()
})

describe('Changelog', () => {
  it('lists the minors newest first, labelled and dated', () => {
    render(Changelog, { onclose: () => {} })
    const groups = screen.getAllByRole('list')[0]!.querySelectorAll(':scope > li')
    expect(groups).toHaveLength(2)
    expect(groups[0]!.textContent).toContain('0.11')
    expect(groups[0]!.textContent).toContain('Five rooms at once.')
    expect(groups[1]!.textContent).toContain(asOfDate('2026-09-25'))
    expect(groups[1]!.textContent).toContain('A footer.')
  })

  it("nests a minor's patches beneath it, newest first", () => {
    render(Changelog, { onclose: () => {} })
    const minor = screen.getByText('A footer.').closest('li')!
    const patches = within(minor).getAllByRole('listitem')
    expect(patches.map((patch) => patch.textContent)).toEqual([
      expect.stringContaining('0.10.2'),
      expect.stringContaining('0.10.1'),
    ])
    expect(screen.queryByText('0.10.0')).toBeNull()
    expect(screen.getByText('0.10')).toBeTruthy()
  })

  it('links every release on GitHub in a new tab', () => {
    render(Changelog, { onclose: () => {} })
    const link = screen.getByRole('link', { name: 'All releases on GitHub' })
    expect(link.getAttribute('href')).toBe(RELEASES_URL)
    expect(link.getAttribute('target')).toBe('_blank')
  })

  it('closes on Got it and on Escape', async () => {
    const onclose = vi.fn()
    render(Changelog, { onclose })
    await fireEvent.click(screen.getByRole('button', { name: 'Got it' }))
    await fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))
    expect(onclose).toHaveBeenCalledTimes(2)
  })
})
