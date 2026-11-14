/** A screen fetched on demand, which a failed fetch must not leave blank. */

import { fireEvent, render, screen } from '@testing-library/svelte'
import { createRawSnippet } from 'svelte'
import { describe, expect, it, vi } from 'vitest'

import LazyRoute from './LazyRoute.svelte'

const screenOf = createRawSnippet((module: () => unknown) => ({
  render: () => `<h1>${(module() as { title: string }).title}</h1>`,
}))

describe('LazyRoute', () => {
  it('draws the screen once its module loads', async () => {
    render(LazyRoute, { load: () => Promise.resolve({ title: 'Suggest' }), children: screenOf })
    expect(screen.getByText('Loading…')).toBeTruthy()
    expect(await screen.findByRole('heading', { name: 'Suggest' })).toBeTruthy()
  })

  it('says a failed fetch failed, and a retry loads the screen', async () => {
    const load = vi
      .fn<() => Promise<{ title: string }>>()
      .mockRejectedValueOnce(new TypeError('Failed to fetch dynamically imported module'))
      .mockResolvedValueOnce({ title: 'Report' })
    render(LazyRoute, { load, children: screenOf })
    expect(await screen.findByText(/This page didn't load\./)).toBeTruthy()
    await fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { name: 'Report' })).toBeTruthy()
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('offers a reload once a retry fails too', async () => {
    const reload = vi.fn()
    const load = vi.fn(() => Promise.reject(new TypeError('offline')))
    render(LazyRoute, { load, reload, children: screenOf })
    await fireEvent.click(await screen.findByRole('button', { name: 'Try again' }))
    await fireEvent.click(await screen.findByRole('button', { name: 'Reload page' }))
    expect(reload).toHaveBeenCalledOnce()
  })
})
