/**
 * The bar: a sign that goes home, the name with no version, GitHub, and one slot for the
 * menu, a dead placeholder until filled. The stock branding; `TopBar.branding.test.ts` has
 * a selfhoster's.
 */

import { fireEvent, render, screen } from '@testing-library/svelte'
import { createRawSnippet } from 'svelte'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { REPO_URL, VERSION_LABEL } from '../lib/links'
import TopBar from './TopBar.svelte'

const navigate = vi.fn()

const slot = (label: string) =>
  createRawSnippet(() => ({ render: () => `<button type="button">${label}</button>` }))

beforeEach(() => navigate.mockClear())

/** The right-hand group's controls, left to right, by what they are called. */
function controls(): string[] {
  const group = document.querySelector('.controls')!
  return [...group.querySelectorAll('button, [aria-label]')].map(
    (control) => control.getAttribute('aria-label') ?? control.textContent ?? '',
  )
}

describe('TopBar', () => {
  it('goes home on a plain click of the sign, and leaves a modified one to the browser', async () => {
    render(TopBar, { navigate })
    const sign = screen.getByRole('link', { name: 'The Jolly Boar Inn, home' })
    expect(sign.getAttribute('href')).toBe('/')
    expect(await fireEvent.click(sign, { ctrlKey: true })).toBe(true)
    expect(navigate).not.toHaveBeenCalled()
    expect(await fireEvent.click(sign)).toBe(false)
    expect(navigate).toHaveBeenCalledWith('/')
  })

  it('names the inn on the bundled sign, and leaves the version to the footer', () => {
    render(TopBar, { navigate })
    expect(document.querySelector('.wordmark')!.textContent!.trim()).toBe('The Jolly Boar Inn')
    expect(document.querySelector('.sign-letter')!.textContent!.trim()).toBe('J')
    expect(document.querySelector('header img')).toBeNull()
    expect(document.querySelector('header')!.textContent).not.toContain(VERSION_LABEL)
  })

  it('links to the source on GitHub, in a new tab', () => {
    render(TopBar, { navigate })
    const github = screen.getByRole('link', { name: 'Source code on GitHub' })
    expect(github.getAttribute('href')).toBe(REPO_URL)
    expect(github.getAttribute('target')).toBe('_blank')
  })

  it('offers a way past the bar to the screen', () => {
    render(TopBar, { navigate })
    expect(screen.getByRole('link', { name: 'Skip to the game' }).getAttribute('href')).toBe(
      '#content',
    )
  })

  it('holds GitHub and one control, a placeholder nobody can press', () => {
    render(TopBar, { navigate })
    expect(controls()).toEqual(['Source code on GitHub', 'You'])
    expect(document.querySelector('.controls button')).toBeNull()
    expect(screen.getByText('Guest')).toBeTruthy()
  })

  it('draws the menu it is given in place of the placeholder', () => {
    render(TopBar, { navigate, menu: slot('menu') })
    expect(controls()).toEqual(['Source code on GitHub', 'menu'])
    expect(screen.queryByText('Guest')).toBeNull()
  })

  it('puts the Host menu first among the controls when the room gives one', () => {
    const { unmount } = render(TopBar, {
      navigate,
      menu: slot('You'),
      host: [{ label: 'End the game', run: () => {} }],
    })
    expect(controls().map((name) => name.trim())).toEqual(['Host', 'Source code on GitHub', 'You'])
    unmount()
    render(TopBar, { navigate, menu: slot('You') })
    expect(controls()).toEqual(['Source code on GitHub', 'You'])
  })

  it('names a past game and when it ended in its middle, and only the code for one never kept', () => {
    const finishedAt = new Date(2026, 9, 25, 21, 14).toISOString()
    const { unmount } = render(TopBar, { navigate, past: { code: 'FireCape', finishedAt } })
    const middle = document.querySelector('.where')!
    expect(middle.querySelector('.long')!.textContent).toBe('finished Sun 25 Oct at 21:14')
    expect(middle.querySelector('.short')!.textContent).toBe('25 Oct')
    expect(middle.querySelector('strong')!.textContent).toBe('FireCape')
    unmount()
    render(TopBar, { navigate, past: { code: 'FireCape', finishedAt: null } })
    expect(document.querySelector('.where')!.textContent?.trim()).toBe('FireCape')
  })
})
