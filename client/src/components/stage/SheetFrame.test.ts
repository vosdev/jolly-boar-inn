/** jsdom has no layout, so every sheet's frame is checked in the sources' CSS. */

import { describe, expect, it } from 'vitest'

import type { Sheet } from '../../lib/sheet'
import scrollSource from './ClueScroll.svelte?raw'

const OTHERS: Sheet[] = ['poster', 'bunting', 'slab', 'bamboo', 'gate', 'gravestone', 'sign']

function rule(selector: string): string | null {
  const start = scrollSource.indexOf(`\n  ${selector} {`)
  return start < 0 ? null : scrollSource.slice(start, scrollSource.indexOf('}', start))
}

describe('every sheet sets its words in alike', () => {
  it("pads every sheet's paper by the scroll's frame, less the border it draws", () => {
    const shared = rule(":where(.scroll:not([data-sheet='scroll'])) .paper")
    expect(shared).toContain('calc(var(--frame-top) - var(--rim))')
    expect(shared).toContain('calc(var(--frame-side) - var(--rim))')
    expect(shared).toContain('calc(var(--frame-bottom) - var(--rim))')
    expect(rule('.reveal')).toContain('padding: var(--rim)')
  })

  it('lets no sheet pad its own paper or border', () => {
    for (const sheet of OTHERS) {
      for (const part of ['.paper', '.reveal']) {
        const own = rule(`:where(.scroll[data-sheet='${sheet}']) ${part}`)
        expect(own ?? '', `${sheet} ${part}`).not.toMatch(/padding|margin/)
      }
    }
  })
})
