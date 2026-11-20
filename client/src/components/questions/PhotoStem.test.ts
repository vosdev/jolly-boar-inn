import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte'
import { writable } from 'svelte/store'
import { afterEach, describe, expect, it } from 'vitest'

import { viewFor } from './index'
import type { StemTiming } from './props'
import PhotoStem from './stems/PhotoStem.svelte'
import photoSource from './stems/PhotoStem.svelte?raw'

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

  it('takes taps in its dialog, though the map’s sheet it is written in lets them through', () => {
    const rule = photoSource.match(/\n {2}\.whole \{([^}]*)\}/)?.[1] ?? ''
    expect(rule).toContain('pointer-events: auto;')
  })

  it('stays on the sheet with nothing to hide where there is no map stage', () => {
    const { container } = draw({ prompt: 'Where?', pins: 1, width: 800, height: 450 })
    expect(container.querySelector('.recon.card')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Hide' })).toBeNull()
  })

  describe('on a map stage', () => {
    function onMap() {
      const stage = document.body.appendChild(document.createElement('div'))
      stage.className = 'stage map'
      const sheet = stage.appendChild(document.createElement('div'))
      sheet.className = 'stage-row'
      render(PhotoStem, {
        target: sheet,
        props: {
          data: { prompt: 'Where?', pins: 1, width: 800, height: 450 },
          revealed: false,
          timing,
        },
      })
      return { stage, sheet }
    }

    afterEach(() => document.querySelector('.stage.map')?.remove())

    it('stands on the map as a card of its own, off the sheet', () => {
      const { stage, sheet } = onMap()
      const card = stage.querySelector(':scope > .recon.card')
      expect(card).toBeTruthy()
      expect(sheet.querySelector('.recon')).toBeNull()
      expect(within(sheet).getByText('Where?')).toBeTruthy()
    })

    it('hides, and Show photo on the sheet brings it back', async () => {
      const { stage, sheet } = onMap()
      const card = stage.querySelector(':scope > .recon')!
      await fireEvent.click(screen.getByRole('button', { name: 'Hide' }))
      expect(card.classList.contains('away')).toBe(true)
      await fireEvent.click(within(sheet).getByRole('button', { name: 'Show photo' }))
      expect(card.classList.contains('away')).toBe(false)
      expect(within(sheet).queryByRole('button', { name: 'Show photo' })).toBeNull()
    })
  })

  it('says so when this server lacks the photo', () => {
    draw({ prompt: 'Where?', pins: 1, width: 800, height: 450 })
    expect(screen.getAllByText('This photo is missing on this server.').length).toBeGreaterThan(0)
  })
})
