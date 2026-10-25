/**
 * The Host menu in the top bar: shut until pressed, the room's actions in order, and
 * shut again once one is picked or the host looks away.
 */

import { fireEvent, render, screen } from '@testing-library/svelte'
import { describe, expect, it, vi } from 'vitest'

import HostMenu from './HostMenu.svelte'

function actions() {
  return [
    { label: 'Close this question now', run: vi.fn() },
    { label: 'End the round', run: vi.fn() },
    { label: 'End the game', run: vi.fn() },
  ]
}

function control(): HTMLElement {
  return screen.getByRole('button', { name: 'Host' })
}

describe('HostMenu', () => {
  it('lists the actions in order once opened', async () => {
    render(HostMenu, { actions: actions() })
    expect(control().getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('group', { name: 'Host' })).toBeNull()
    await fireEvent.click(control())
    const menu = screen.getByRole('group', { name: 'Host' })
    expect([...menu.querySelectorAll('button')].map((b) => b.textContent)).toEqual([
      'Close this question now',
      'End the round',
      'End the game',
    ])
    expect(document.activeElement?.textContent).toBe('Close this question now')
  })

  it('runs the one picked and closes', async () => {
    const list = actions()
    render(HostMenu, { actions: list })
    await fireEvent.click(control())
    await fireEvent.click(screen.getByRole('button', { name: 'End the round' }))
    expect(list[1]!.run).toHaveBeenCalledOnce()
    expect(list[0]!.run).not.toHaveBeenCalled()
    expect(screen.queryByRole('group', { name: 'Host' })).toBeNull()
  })

  it('closes on Escape, handing focus back, and on a tap outside', async () => {
    render(HostMenu, { actions: actions() })
    await fireEvent.click(control())
    await fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('group', { name: 'Host' })).toBeNull()
    expect(document.activeElement).toBe(control())
    await fireEvent.click(control())
    await fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('group', { name: 'Host' })).toBeNull()
  })
})
