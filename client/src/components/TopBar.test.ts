/**
 * The bar: a sign that goes home, the name with no version, GitHub, and identity, sound
 * and theme slots in that order, each a dead placeholder until filled. The stock branding;
 * `TopBar.branding.test.ts` has a selfhoster's.
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

  it('holds identity, sound and theme with placeholders nobody can press', () => {
    render(TopBar, { navigate })
    expect(controls()).toEqual(['Source code on GitHub', 'You', 'Sound', 'Theme'])
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
    expect(controls()).toEqual(['Source code on GitHub', 'chip', 'volume', 'picker'])
    expect(screen.queryByText('Guest')).toBeNull()
  })
})
