/** How to play's trail: every stop can be picked, Continue walks them, and the last has the answers. */

import { cleanup, fireEvent, render, screen } from '@testing-library/svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { NIGHT_STOPS, loadModes } from '../lib/howToPlay'
import HowToTrail from './HowToTrail.svelte'

vi.mock('../lib/howToPlay', async (importOriginal) => {
  const real = await importOriginal<typeof import('../lib/howToPlay')>()
  return { ...real, loadModes: vi.fn() }
})

const noop = (): void => {}
const opened = (): string | undefined =>
  screen.getAllByRole('heading', { level: 3 })[0]?.textContent

function draw(props: Partial<{ createDisabled: boolean; oncreate: () => void }> = {}): void {
  render(HowToTrail, { ontry: noop, oncreate: noop, ...props })
}

beforeEach(() => vi.mocked(loadModes).mockResolvedValue([]))
afterEach(cleanup)

describe('HowToTrail', () => {
  it('opens on the first stop, marked as the current one', () => {
    draw()
    expect(opened()).toBe(NIGHT_STOPS[0]?.title)
    const current = document.querySelector('[aria-current="step"]')
    expect(current?.textContent).toContain(NIGHT_STOPS[0]?.label)
  })

  it('opens any stop that is picked, without walking there', async () => {
    draw()
    await fireEvent.click(screen.getByRole('button', { name: /Ready up$/ }))
    expect(opened()).toBe('Ready up to start')
  })

  it('walks every stop with Continue, and back, ending with no Continue', async () => {
    draw()
    for (const stop of NIGHT_STOPS.slice(1)) {
      await fireEvent.click(screen.getByRole('button', { name: 'Click here to continue' }))
      expect(opened()).toBe(stop.title)
    }
    expect(screen.queryByRole('button', { name: 'Click here to continue' })).toBeNull()
    await fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(opened()).toBe(NIGHT_STOPS.at(-2)?.title)
  })

  it('offers no Back on the first stop', () => {
    draw()
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull()
  })

  it('lists every way of answering on the last stop', async () => {
    draw()
    await fireEvent.click(screen.getByRole('button', { name: /Answer$/ }))
    expect(await screen.findByRole('heading', { name: 'Pick all that apply' })).toBeTruthy()
    expect(screen.getByText('Quicker and correct answers score more.')).toBeTruthy()
  })

  it('moves focus on to the words when Continue goes, so it is not lost', async () => {
    draw()
    for (const _ of NIGHT_STOPS.slice(1)) {
      await fireEvent.click(screen.getByRole('button', { name: 'Click here to continue' }))
    }
    expect(document.activeElement?.textContent).toBe(NIGHT_STOPS.at(-1)?.title)
  })

  it('refuses Create at the room limit, as Home does', async () => {
    draw({ createDisabled: true })
    await fireEvent.click(screen.getByRole('button', { name: /Answer$/ }))
    const create = screen.getByRole('button', { name: 'Create a room' }) as HTMLButtonElement
    expect(create.disabled).toBe(true)
  })

  it('gives every stop but the answers a drawing with words', () => {
    for (const stop of NIGHT_STOPS.filter((entry) => entry.id !== 'answer')) {
      expect(stop.drawing, stop.id).not.toBe('')
    }
  })
})
