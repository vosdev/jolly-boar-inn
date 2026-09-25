/**
 * The bar: a sign that goes home, the version beside the name rather than in it, and
 * identity, sound and theme slots in that order, each a dead placeholder until filled.
 */

import { fireEvent, render, screen } from '@testing-library/svelte'
import { createRawSnippet } from 'svelte'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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

  it('puts the version beside the name, in its own element', () => {
    render(TopBar, { navigate })
    const wordmark = document.querySelector('.wordmark')!
    const version = wordmark.querySelector('.version')!
    expect(version.textContent).toBe(__APP_VERSION__.replace(/\.0$/, ''))
    expect(wordmark.textContent?.replace(version.textContent!, '').trim()).toBe('The Jolly Boar Inn')
  })

  it('offers a way past the bar to the screen', () => {
    render(TopBar, { navigate })
    expect(screen.getByRole('link', { name: 'Skip to the game' }).getAttribute('href')).toBe(
      '#content',
    )
  })

  it('holds identity, sound and theme with placeholders nobody can press', () => {
    render(TopBar, { navigate })
    expect(controls()).toEqual(['You', 'Sound', 'Theme'])
    for (const name of ['Sound', 'Theme']) {
      expect((screen.getByRole('button', { name }) as HTMLButtonElement).disabled).toBe(true)
    }
    expect(screen.getByText('Guest')).toBeTruthy()
  })

  it('draws what each slot is given in place of its placeholder, in the same order', () => {
    render(TopBar, {
      navigate,
      theme: slot('picker'),
      sound: slot('volume'),
      identity: slot('chip'),
    })
    expect(controls()).toEqual(['chip', 'volume', 'picker'])
    expect(screen.queryByText('Guest')).toBeNull()
  })
})
