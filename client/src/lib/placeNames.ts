/**
 * The game's place names, written over the clean tiles as its world map writes them
 * (RuneLite's `MapImageDumper.drawMapLabels`): each line centred on its spot in one of three
 * fonts, at the font's own size at every zoom, the label's colour over a black shadow a pixel
 * down and right. The bigger the name, the further out it shows. `make gen-map` writes the
 * labels and the fonts' glyphs beside the tiles.
 */

import pin from '../../../data/map.json'
import { TILE_SIZE } from './map'

/** The lowest zoom each size shows at: small, medium, large. */
export const LABELS_FROM_ZOOM = [0, -1, -2] as const

/** A glyph's cell on the sheet and where it stands from the pen. */
export type Glyph = [left: number, top: number, width: number, height: number, x: number, y: number]

export interface LabelFont {
  ascent: number
  /** How far the pen moves for each character code. */
  advances: number[]
  /** Each character code's glyph; a space has none. */
  glyphs: Record<string, Glyph>
}

/** `labels.json`: the three fonts, and each label's game tile, size, RGB colour and lines. */
export interface LabelIndex {
  fonts: LabelFont[]
  labels: [x: number, y: number, size: number, colour: number, lines: string[]][]
}

export interface LabelLayer extends LabelIndex {
  glyphs: CanvasImageSource
}

/** One glyph to copy from the sheet onto a tile, in a label's colour, at its top-left corner. */
export interface Written {
  glyph: Glyph
  colour: number
  left: number
  top: number
}

const ROOT = `/map/${pin.cache_id}/labels`
/** Room round a tile for the shadow, which the glyph's own box leaves out. */
const SHADOW = 1

/** How wide a line is in a font, as the game measures it. */
function widthOf(font: LabelFont, line: string): number {
  let width = 0
  for (const char of line) width += font.advances[char.charCodeAt(0)] ?? 0
  return width
}

/**
 * The glyphs on the Leaflet tile at `zoom`, column `x` and Leaflet's `row`, which counts south.
 * A label stands where the game puts it: its first line's middle on the west edge of its game
 * tile, a tile north of it, and each next line half the font's ascent lower.
 */
export function labelsOnTile(index: LabelIndex, zoom: number, x: number, row: number): Written[] {
  const scale = 2 ** zoom
  const written: Written[] = []
  for (const [tileX, tileY, size, colour, lines] of index.labels) {
    const font = index.fonts[size]
    const from = LABELS_FROM_ZOOM[size as 0 | 1 | 2]
    if (font === undefined || from === undefined || zoom < from) continue
    const step = Math.trunc(font.ascent / 2)
    const penX = Math.round(tileX * scale) - x * TILE_SIZE
    const penY = Math.round(-(tileY + 2) * scale) - row * TILE_SIZE - step
    lines.forEach((line, number) => {
      let advance = -Math.trunc(widthOf(font, line) / 2)
      for (const char of line) {
        const code = char.charCodeAt(0)
        const glyph = font.glyphs[String(code)]
        if (glyph !== undefined) {
          const [, , width, height, offsetX, offsetY] = glyph
          const left = penX + advance + offsetX
          const top = penY + number * step + offsetY
          if (
            left - SHADOW < TILE_SIZE &&
            top - SHADOW < TILE_SIZE &&
            left + width + SHADOW > 0 &&
            top + height + SHADOW > 0
          ) {
            written.push({ glyph, colour, left, top })
          }
        }
        advance += font.advances[code] ?? 0
      }
    })
  }
  return written
}

let loading: Promise<LabelLayer | null> | null = null

/**
 * The label layer, fetched once however many maps show it. Null on an install whose map
 * predates the labels, which then shows none.
 */
export function loadLabels(): Promise<LabelLayer | null> {
  loading ??= Promise.all([
    fetch(`${ROOT}/labels.json`).then((response) =>
      response.ok ? (response.json() as Promise<LabelIndex>) : null,
    ),
    new Promise<HTMLImageElement>((done, failed) => {
      const sheet = new Image()
      sheet.onload = () => done(sheet)
      sheet.onerror = failed
      sheet.src = `${ROOT}/glyphs.png`
    }),
  ])
    .then(([index, glyphs]) => (index === null ? null : { ...index, glyphs }))
    // A dev server answers a missing file with a page, which is no JSON.
    .catch(() => null)
  return loading
}
