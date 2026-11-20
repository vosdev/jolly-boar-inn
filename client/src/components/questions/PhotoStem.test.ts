import { cleanup, fireEvent, render, screen } from '@testing-library/svelte'
import { writable } from 'svelte/store'
import { afterEach, describe, expect, it } from 'vitest'

import { viewFor } from './index'
import type { StemTiming } from './props'
import PhotoStem from './stems/PhotoStem.svelte'

const timing: StemTiming = {
  answerableAt: '2026-11-20T20:00:00Z',
  endsAt: '2026-11-20T20:00:40Z',
  now: writable(Date.parse('2026-11-20T20:00:10Z')),
}

afterEach(cleanup)

function draw(data: Record<string, unknown>) {
  return render(PhotoStem, { data, revealed: false, timing })
}

describe('the recon photo', () => {
  it('is KGP Recon’s stem', () => {
    expect(viewFor('map_pin', 'kgp_recon').stem).toBe(PhotoStem)
  })

  it('shows the prompt and the photo in its shape, under the camera', () => {
    const { container } = draw({
      prompt: 'Where was this photo taken?',
      pins: 1,
      width: 1600,
      height: 900,
      picture: 'a1b2.webp',
    })
    expect(screen.getByText('Where was this photo taken?')).toBeTruthy()
    const frame = container.querySelector<HTMLElement>('.recon .frame')!
    expect(frame.style.aspectRatio).toBe('1600 / 900')
    expect(frame.querySelector('img.shot')?.getAttribute('src')).toBe('/pictures/a1b2.webp')
    expect(frame.querySelector('img.overlay')).toBeTruthy()
  })

  it('opens whole in a dialog on a tap', async () => {
    const { container } = draw({
      prompt: 'Where?',
      pins: 1,
      width: 800,
      height: 450,
      picture: 'x.webp',
    })
    const dialog = container.querySelector('dialog')!
    let opened = false
    dialog.showModal = () => {
      opened = true
    }
    await fireEvent.click(screen.getByRole('button', { name: 'Show the photo full size' }))
    expect(opened).toBe(true)
  })

  it('says so when this server lacks the photo', () => {
    draw({ prompt: 'Where?', pins: 1, width: 800, height: 450 })
    expect(screen.getAllByText('This photo is missing on this server.').length).toBeGreaterThan(0)
  })
})
