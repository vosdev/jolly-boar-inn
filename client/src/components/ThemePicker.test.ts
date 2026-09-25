/**
 * The picker offers the three themes and nothing that follows the device, shows jolly
 * selected to a browser that never chose, and repaints the moment one is picked.
 */

import { fireEvent, render, screen } from '@testing-library/svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { THEME_LABELS, THEMES } from '../lib/theme'
import ThemePicker from './ThemePicker.svelte'

const radios = () => screen.getAllByRole('radio') as HTMLInputElement[]

async function opened(): Promise<void> {
  render(ThemePicker)
  await fireEvent.click(screen.getByRole('button', { name: /^Theme: / }))
}

beforeEach(() => {
  localStorage.clear()
  delete document.documentElement.dataset.theme
  // A phone set to dark, which nothing here may follow.
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('dark'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('ThemePicker', () => {
  it('offers exactly the themes, by name and in order, and no follow-my-device entry', async () => {
    await opened()
    expect(radios().map((radio) => radio.value)).toEqual([...THEMES])
    const names = [...document.querySelectorAll('.theme-name')].map((name) => name.textContent)
    expect(names).toEqual(THEMES.map((theme) => THEME_LABELS[theme].name))
  })

  it('shows jolly selected to a browser that never chose, on a dark device too', async () => {
    await opened()
    expect(radios().filter((radio) => radio.checked).map((radio) => radio.value)).toEqual(['jolly'])
    expect(screen.getByRole('button', { name: 'Theme: Jolly Boar Inn. Change theme' })).toBeTruthy()
  })

  it('shows the stored choice selected', async () => {
    localStorage.setItem('jbi:theme', 'wilderness')
    await opened()
    expect(radios().find((radio) => radio.checked)?.value).toBe('wilderness')
  })

  it('draws each swatch in its own theme', async () => {
    await opened()
    const swatches = radios().map(
      (radio) => radio.closest('label')?.querySelector<HTMLElement>('.swatch')?.dataset.theme,
    )
    expect(swatches).toEqual([...THEMES])
  })

  it('repaints at once, stays open, and remembers the choice', async () => {
    await opened()
    await fireEvent.click(radios()[1]!)
    expect(document.documentElement.dataset.theme).toBe('pollnivneach')
    expect(localStorage.getItem('jbi:theme')).toBe('pollnivneach')
    expect(screen.getByRole('dialog', { name: 'Theme' })).toBeTruthy()
    expect(radios()[1]!.checked).toBe(true)
  })

  it('still repaints with storage throwing, and starts on jolly', async () => {
    const denied = (): never => {
      throw new DOMException('The operation is insecure.', 'SecurityError')
    }
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(denied)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(denied)
    await opened()
    expect(radios().find((radio) => radio.checked)?.value).toBe('jolly')
    await fireEvent.click(radios()[2]!)
    expect(document.documentElement.dataset.theme).toBe('wilderness')
  })
})
