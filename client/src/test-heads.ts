/**
 * For the component tests: which head a rendered `<Head>` shows, and at what size, read
 * back from the window it cuts out of the sheet.
 */

import { cell, columns } from 'virtual:heads'

export interface Drawn {
  head: number
  size: number
}

/** Every head drawn under `root`, in document order. */
export function headsDrawn(root: ParentNode): Drawn[] {
  return [...root.querySelectorAll<HTMLElement>('.head')].map((window) => {
    const size = parseFloat(window.style.width)
    const scale = Math.max(1, Math.round(size / cell))
    const drawn = cell * scale
    const inset = (size - drawn) / 2
    const shift = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(
      window.querySelector('img')?.style.transform ?? '',
    )
    if (shift === null) throw new Error('a head with no sheet behind it')
    const column = (-Number(shift[1]) + inset) / drawn
    const row = (-Number(shift[2]) + inset) / drawn
    return { head: row * columns + column, size }
  })
}
