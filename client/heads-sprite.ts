/**
 * `virtual:heads`: the fifty chat heads in `data/heads/` as one sprite sheet (D4, section
 * 5.2 of ideas/design.md).
 *
 * The heads are committed one file each, because each was picked by a person and review
 * is where that choice is checked. The client never fetches fifty files, though: this
 * plugin reads `heads.json`, decodes every PNG it names, lays them out in a grid of
 * equal square cells in manifest order, and hands the page one PNG. The build emits it
 * as a hashed asset; the dev server inlines it as a data URL, which `img-src data:`
 * already allows, so neither needs a route of its own.
 *
 * Decoding and encoding are done here with `node:zlib` rather than a dependency: a
 * non-interlaced, 8-bit PNG is a zlib stream of filtered scanlines, which is what the
 * wiki's chat heads and anything an image editor saves both are. Anything else is a
 * build error naming the file, rather than a head drawn wrong.
 *
 * The module exports the sheet's URL, the cell size in source pixels, the number of
 * columns, and the heads' names in id order — the id is the index, and it is the
 * contract (`app/heads.py`), so position in this list is the only lookup there is.
 */

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync, inflateSync } from 'node:zlib'

import type { Plugin } from 'vite'

const HEADS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../data/heads')
const MANIFEST = resolve(HEADS_DIR, 'heads.json')
const VIRTUAL = 'virtual:heads'
const RESOLVED = '\0' + VIRTUAL
/** Ten across: fifty heads are a 10×5 sheet. */
const COLUMNS = 10

interface Head {
  id: number
  file: string
  name: string
}

interface Image {
  width: number
  height: number
  /** RGBA, row-major, 4 bytes a pixel. */
  pixels: Uint8Array
}

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
/** Samples a pixel per colour type: grey, -, RGB, palette, grey+alpha, -, RGBA. */
const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
}

/** A PNG file as RGBA. Throws on anything this plugin does not handle. */
export function decodePng(bytes: Buffer, name: string): Image {
  if (!bytes.subarray(0, 8).equals(SIGNATURE)) throw new Error(`${name}: not a PNG`)
  let width = 0
  let height = 0
  let depth = 0
  let type = 0
  let palette: Buffer | null = null
  let transparency: Buffer | null = null
  const data: Buffer[] = []
  for (let at = 8; at < bytes.length; ) {
    const length = bytes.readUInt32BE(at)
    const kind = bytes.toString('latin1', at + 4, at + 8)
    const body = bytes.subarray(at + 8, at + 8 + length)
    at += 12 + length
    if (kind === 'IHDR') {
      width = body.readUInt32BE(0)
      height = body.readUInt32BE(4)
      depth = body[8]
      type = body[9]
      if (body[12] !== 0) throw new Error(`${name}: interlaced PNGs are not supported`)
    } else if (kind === 'PLTE') palette = body
    else if (kind === 'tRNS') transparency = body
    else if (kind === 'IDAT') data.push(body)
    else if (kind === 'IEND') break
  }
  const channels = CHANNELS[type]
  const paletted = type === 3
  if (channels === undefined || (depth !== 8 && !(paletted && [1, 2, 4].includes(depth)))) {
    throw new Error(`${name}: colour type ${type} at ${depth} bits is not supported; save as 8-bit RGBA`)
  }
  if (paletted && palette === null) throw new Error(`${name}: palette image with no PLTE`)

  const bitsPerPixel = channels * depth
  const stride = Math.ceil((width * bitsPerPixel) / 8)
  const step = Math.max(1, bitsPerPixel >> 3)
  const raw = inflateSync(Buffer.concat(data))
  const lines = new Uint8Array(stride * height)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    const source = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    const row = y * stride
    for (let x = 0; x < stride; x++) {
      const a = x >= step ? lines[row + x - step] : 0
      const b = y > 0 ? lines[row - stride + x] : 0
      const c = x >= step && y > 0 ? lines[row - stride + x - step] : 0
      const predictor = [0, a, b, (a + b) >> 1, paeth(a, b, c)][filter]
      if (predictor === undefined) throw new Error(`${name}: bad filter ${filter} on row ${y}`)
      lines[row + x] = (source[x] + predictor) & 0xff
    }
  }

  const pixels = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const out = (y * width + x) * 4
      const row = y * stride
      if (paletted) {
        const perByte = 8 / depth
        const byte = lines[row + Math.floor(x / perByte)]
        const shift = 8 - depth * ((x % perByte) + 1)
        const index = (byte >> shift) & ((1 << depth) - 1)
        pixels.set(palette!.subarray(index * 3, index * 3 + 3), out)
        pixels[out + 3] = transparency !== null && index < transparency.length ? transparency[index] : 255
        continue
      }
      const at = row + x * channels
      if (type === 0 || type === 4) {
        pixels.fill(lines[at], out, out + 3)
        pixels[out + 3] = type === 4 ? lines[at + 1] : 255
      } else {
        pixels.set(lines.subarray(at, at + 3), out)
        pixels[out + 3] = type === 6 ? lines[at + 3] : 255
      }
    }
  }
  return { width, height, pixels }
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(bytes: Buffer): number {
  let c = 0xffffffff
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(kind: string, body: Buffer): Buffer {
  const head = Buffer.alloc(8)
  head.writeUInt32BE(body.length, 0)
  head.write(kind, 4, 'latin1')
  const tail = Buffer.alloc(4)
  tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0)
  return Buffer.concat([head, body, tail])
}

/** RGBA as an 8-bit PNG, every scanline unfiltered. */
export function encodePng(image: Image): Buffer {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(image.width, 0)
  header.writeUInt32BE(image.height, 4)
  header.set([8, 6, 0, 0, 0], 8)
  const stride = image.width * 4
  const raw = Buffer.alloc((stride + 1) * image.height)
  for (let y = 0; y < image.height; y++) {
    raw.set(image.pixels.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1)
  }
  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

export interface Sheet {
  png: Buffer
  /** Every file the sheet was built from, the manifest included, for the watcher. */
  files: string[]
  cell: number
  columns: number
  names: string[]
}

/**
 * Every head in the manifest, in id order, in cells as big as the biggest head. A
 * smaller head sits centred at the bottom of its cell, which is where a chat head's chin
 * goes.
 */
export function buildSheet(manifest = MANIFEST): Sheet {
  const heads = JSON.parse(readFileSync(manifest, 'utf8')) as Head[]
  const files = heads.map((head) => resolve(dirname(manifest), head.file))
  const images = heads.map((head, index) => {
    if (head.id !== index) throw new Error(`${manifest}: entry ${index} has id ${head.id}`)
    return decodePng(readFileSync(files[index]), head.file)
  })
  const cell = Math.max(...images.map((image) => Math.max(image.width, image.height)))
  const rows = Math.ceil(images.length / COLUMNS)
  const width = COLUMNS * cell
  const pixels = new Uint8Array(width * rows * cell * 4)
  images.forEach((image, index) => {
    const left = (index % COLUMNS) * cell + Math.floor((cell - image.width) / 2)
    const top = Math.floor(index / COLUMNS) * cell + (cell - image.height)
    for (let y = 0; y < image.height; y++) {
      const from = y * image.width * 4
      pixels.set(image.pixels.subarray(from, from + image.width * 4), ((top + y) * width + left) * 4)
    }
  })
  return {
    png: encodePng({ width, height: rows * cell, pixels }),
    files: [manifest, ...files],
    cell,
    columns: COLUMNS,
    names: heads.map((head) => head.name),
  }
}

export function headsSprite(): Plugin {
  let serving = false
  return {
    name: 'jbi-heads-sprite',
    configResolved(config) {
      serving = config.command === 'serve'
    },
    resolveId(id) {
      return id === VIRTUAL ? RESOLVED : null
    },
    load(id) {
      if (id !== RESOLVED) return null
      const sheet = buildSheet()
      for (const file of sheet.files) this.addWatchFile(file)
      let url: string
      if (serving) {
        url = JSON.stringify(`data:image/png;base64,${sheet.png.toString('base64')}`)
      } else {
        const ref = this.emitFile({ type: 'asset', name: 'heads.png', source: sheet.png })
        url = `import.meta.ROLLUP_FILE_URL_${ref}`
      }
      return [
        `export const sprite = ${url}`,
        `export const cell = ${sheet.cell}`,
        `export const columns = ${sheet.columns}`,
        `export const names = ${JSON.stringify(sheet.names)}`,
      ].join('\n')
    },
  }
}
