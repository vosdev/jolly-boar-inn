/**
 * KGP Recon's photos are all 16:9, so every card and dialog draws them alike. A suggester's
 * screenshot is cut to that shape in the browser: they pick how much of it and which part,
 * and the cut is what goes up. The server holds photos to the shape (`map_pin.check`).
 *
 * A cut is whole multiples of 16 by 9 pixels, so it is exactly the shape, and at least
 * `PICTURE_MIN_SIDE` tall, as the server holds any picture.
 */

import { base64Of, PICTURE_MIN_SIDE, type ReadPicture } from './suggestPicture'

export const ACROSS = 16
export const DOWN = 9
/** The widest photo sent; the server would shrink a wider one anyway. */
export const SENT_WIDTH = 1920
/** The smallest share of the largest cut the player may zoom in to. */
export const LEAST_SCALE = 0.4

const LEAST_STEPS = Math.ceil(PICTURE_MIN_SIDE / DOWN)

export interface Crop {
  x: number
  y: number
  width: number
  height: number
}

/** Whether a `width` by `height` picture holds a 16:9 cut no smaller than the server takes. */
export function croppable(width: number, height: number): boolean {
  return Math.min(Math.floor(width / ACROSS), Math.floor(height / DOWN)) >= LEAST_STEPS
}

/**
 * The 16:9 cut of a `width` by `height` picture at `scale` of the largest, its middle as near
 * `centre` (fractions of the picture) as the picture allows.
 */
export function cropAt(
  width: number,
  height: number,
  scale: number,
  centre: { x: number; y: number } = { x: 0.5, y: 0.5 },
): Crop {
  const most = Math.min(Math.floor(width / ACROSS), Math.floor(height / DOWN))
  const steps = Math.min(most, Math.max(LEAST_STEPS, Math.floor(most * scale)))
  const wide = steps * ACROSS
  const tall = steps * DOWN
  const clamp = (value: number, room: number) => Math.min(room, Math.max(0, Math.round(value)))
  return {
    x: clamp(centre.x * width - wide / 2, width - wide),
    y: clamp(centre.y * height - tall / 2, height - tall),
    width: wide,
    height: tall,
  }
}

/** The middle of `crop`, in fractions of the picture it was cut from. */
export function centreOf(crop: Crop, width: number, height: number): { x: number; y: number } {
  return { x: (crop.x + crop.width / 2) / width, y: (crop.y + crop.height / 2) / height }
}

/** The size `crop` is sent at: itself, or `SENT_WIDTH` across, still whole steps of 16 by 9. */
export function sentSize(crop: Crop): { width: number; height: number } {
  const steps = Math.min(crop.width, SENT_WIDTH) / ACROSS
  const whole = Math.floor(steps)
  return { width: whole * ACROSS, height: whole * DOWN }
}

function loaded(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('unreadable'))
    image.src = url
  })
}

/** `crop` of the picture at `url`, drawn out as a JPEG ready to preview and send. */
export async function cut(url: string, crop: Crop): Promise<ReadPicture> {
  const image = await loaded(url)
  const { width, height } = sentSize(crop)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (context === null) throw new Error('no canvas')
  context.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, width, height)
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (made) => (made ? resolve(made) : reject(new Error('no blob'))),
      'image/jpeg',
      0.92,
    ),
  )
  return { url: URL.createObjectURL(blob), encoded: await base64Of(blob), width, height }
}
