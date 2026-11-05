/** Pixel art in its box: crisp whole-number upscales, smooth downscales, and a new picture
 * never drawn at the last one's size. */

import { fireEvent, render } from '@testing-library/svelte'
import { describe, expect, it } from 'vitest'

import PixelArt from './PixelArt.svelte'

async function load(img: HTMLImageElement, w: number, h: number): Promise<void> {
  Object.defineProperty(img, 'naturalWidth', { value: w, configurable: true })
  Object.defineProperty(img, 'naturalHeight', { value: h, configurable: true })
  await fireEvent.load(img)
}

describe('PixelArt', () => {
  it('scales a big picture down smoothly to fit', async () => {
    const { container } = render(PixelArt, { src: '/chathead.png', size: 50 })
    const img = container.querySelector('img')!
    await load(img, 200, 100)
    expect([img.style.width, img.style.height]).toEqual(['50px', '25px'])
    expect(img.classList.contains('crisp')).toBe(false)
  })

  it('forgets the last picture’s size when the picture changes', async () => {
    const { container, rerender } = render(PixelArt, { src: '/big.png', size: 64 })
    const img = container.querySelector('img')!
    await load(img, 200, 200)
    expect(img.style.width).toBe('64px')
    await rerender({ src: '/small.png', size: 64 })
    expect([img.style.width, img.style.height]).toEqual(['', ''])
    await load(img, 28, 28)
    expect(img.style.width).toBe('56px')
    expect(img.classList.contains('crisp')).toBe(true)
  })
})
