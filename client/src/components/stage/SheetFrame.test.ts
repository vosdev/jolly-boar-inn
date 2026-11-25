/** jsdom has no layout, so every sheet's frame is checked in the sources' CSS. */

import { describe, expect, it } from 'vitest'

import type { Sheet } from '../../lib/sheet'
import scrollSource from './ClueScroll.svelte?raw'
import { SHEETS } from './sheets'

const SOURCES = import.meta.glob<string>('./sheets/*.svelte', {
  query: '?raw',
  import: 'default',
  eager: true,
})

/** The path of `sheet`'s own file under `sheets/`. */
function fileOf(sheet: Sheet): string {
  return `./sheets/${sheet[0]!.toUpperCase()}${sheet.slice(1)}.svelte`
}

function sheetSource(sheet: Sheet): string {
  const source = SOURCES[fileOf(sheet)]
  expect(source, sheet).toBeDefined()
  return source!
}

function rule(source: string, selector: string): string | null {
  const start = source.indexOf(`\n  ${selector} {`)
  return start < 0 ? null : source.slice(start, source.indexOf('}', start))
}

const ALL = Object.keys(SHEETS) as Sheet[]

describe('every sheet sets its words in alike', () => {
  it("pads every sheet's paper by the scroll's frame, less the border it draws", () => {
    const shared = rule(scrollSource, ":where(.scroll:not([data-sheet='scroll'])) .paper")
    expect(shared).toContain('calc(var(--frame-top) - var(--rim))')
    expect(shared).toContain('calc(var(--frame-side) - var(--rim))')
    expect(shared).toContain('calc(var(--frame-bottom) - var(--rim))')
    expect(rule(scrollSource, '.reveal')).toContain('padding: var(--rim)')
  })

  it('lets no sheet pad its own paper or border', () => {
    for (const sheet of ALL) {
      for (const part of ['.paper', '.reveal']) {
        const own = rule(sheetSource(sheet), `:global(.scroll[data-sheet='${sheet}'] ${part})`)
        expect(own ?? '', `${sheet} ${part}`).not.toMatch(/padding|margin/)
      }
    }
  })
})

describe('a sheet of its own', () => {
  it('is one file under sheets/ and one entry in SHEETS', () => {
    const files = Object.keys(SOURCES).filter((file) => !file.endsWith('/Facets.svelte'))
    expect(files.sort()).toEqual(ALL.map(fileOf).sort())
  })

  it('styles only its own root, reveal and paper outside its own pieces', () => {
    for (const sheet of ALL) {
      const reached = [...sheetSource(sheet).matchAll(/:global\(([^)]*)\)/g)].map((m) => m[1]!)
      expect(reached, sheet).not.toEqual([])
      for (const selector of reached) {
        expect(selector, sheet).toMatch(
          new RegExp(`^\\.scroll\\[data-sheet='${sheet}'\\]( \\.(reveal|paper))?$`),
        )
      }
    }
  })
})
