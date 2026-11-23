import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte'
import { writable } from 'svelte/store'
import { afterEach, describe, expect, it } from 'vitest'

import { viewFor } from './index'
import type { StemProps, StemTiming } from './props'
import MinimapStem from './stems/MinimapStem.svelte'

const timing: StemTiming = {
  answerableAt: '2026-11-23T20:00:00Z',
  endsAt: '2026-11-23T20:00:30Z',
  now: writable(Date.parse('2026-11-23T20:00:10Z')),
}

afterEach(cleanup)

function draw(data: Record<string, unknown>) {
  return render(MinimapStem, { data, revealed: false, timing } satisfies StemProps)
}

describe('the minimap', () => {
  it('is Minimap Guesser’s stem', () => {
    expect(viewFor('map_pin', 'minimap_guesser').stem).toBe(MinimapStem)
  })

  it('shows the prompt and the baked picture in its ring, with the player’s dot', () => {
    const { container } = draw({ prompt: 'Where is this?', pins: 1, picture: 'a1b2.png' })
    expect(screen.getByText('Where is this?')).toBeTruthy()
    const minimap = container.querySelector('.minimap')!
    expect(minimap.querySelector('img.baked')?.getAttribute('src')).toBe('/pictures/a1b2.png')
    expect(minimap.querySelector('canvas')).toBeNull()
    expect(minimap.querySelector('.dot')).toBeTruthy()
    expect(container.querySelector('img.ring')).toBeTruthy()
  })

  it('turns the game’s compass so its N points where north is on the picture', () => {
    const { container } = draw({ prompt: 'Where is this?', pins: 1, picture: 'a.png', north: 135 })
    const compass = container.querySelector<HTMLImageElement>('.compass img')!
    expect(compass.style.transform).toBe('rotate(135deg)')
  })

  it('shows no compass for a picture with no north', () => {
    const { container } = draw({ prompt: 'Where is this?', pins: 1, picture: 'a.png' })
    expect(container.querySelector('.compass')).toBeNull()
  })

  it('draws a preview’s spot from the tiles, turned', () => {
    const { container } = draw({
      prompt: 'Where is this?',
      pins: 1,
      minimap: { x: 3212, y: 3428, angle: 30 },
    })
    const canvas = container.querySelector<HTMLCanvasElement>('canvas.drawn')!
    expect(canvas.style.transform).toBe('rotate(30deg)')
  })

  it('says so when this server lacks the picture', () => {
    draw({ prompt: 'Where is this?', pins: 1 })
    expect(screen.getByText('This minimap is missing on this server.')).toBeTruthy()
  })

  describe('on a map stage', () => {
    function onMap(className = 'stage map') {
      const stage = document.body.appendChild(document.createElement('div'))
      stage.className = className
      const sheet = stage.appendChild(document.createElement('div'))
      sheet.className = 'stage-row'
      render(MinimapStem, {
        target: sheet,
        props: {
          data: { prompt: 'Where is this?', pins: 1, picture: 'a.png' },
          revealed: false,
          timing,
        },
      })
      return { stage, sheet }
    }

    afterEach(() => document.querySelector('.stage')?.remove())

    it('moves onto the stage once it turns into a map, as a round’s first question does', async () => {
      const { stage, sheet } = onMap('stage')
      expect(sheet.querySelector('.chart')).toBeTruthy()
      stage.classList.add('map')
      await waitFor(() => expect(stage.querySelector(':scope > .chart.card')).toBeTruthy())
      expect(sheet.querySelector('.chart')).toBeNull()
      expect(screen.getByRole('button', { name: 'Hide' })).toBeTruthy()
    })

    it('moves onto the map once the scroll carries it onto the stage', async () => {
      const elsewhere = document.body.appendChild(document.createElement('div'))
      render(MinimapStem, {
        target: elsewhere,
        props: { data: { prompt: 'Where?', pins: 1, picture: 'a.png' }, revealed: false, timing },
      })
      const stage = document.body.appendChild(document.createElement('div'))
      stage.className = 'stage map'
      const sheet = stage.appendChild(document.createElement('div'))
      sheet.className = 'stage-row'
      sheet.append(...elsewhere.childNodes)
      elsewhere.remove()
      await waitFor(() => expect(stage.querySelector(':scope > .chart.card')).toBeTruthy())
    })

    it('stands on the map as a card of its own, off the sheet', () => {
      const { stage, sheet } = onMap()
      expect(stage.querySelector(':scope > .chart.card .minimap')).toBeTruthy()
      expect(sheet.querySelector('.chart')).toBeNull()
      expect(within(sheet).getByText('Where is this?')).toBeTruthy()
    })

    it('hides, and Show minimap on the sheet brings it back', async () => {
      const { stage, sheet } = onMap()
      const card = stage.querySelector(':scope > .chart')!
      await fireEvent.click(screen.getByRole('button', { name: 'Hide' }))
      expect(card.classList.contains('away')).toBe(true)
      await fireEvent.click(within(sheet).getByRole('button', { name: 'Show minimap' }))
      expect(card.classList.contains('away')).toBe(false)
      expect(within(sheet).queryByRole('button', { name: 'Show minimap' })).toBeNull()
    })
  })
})
