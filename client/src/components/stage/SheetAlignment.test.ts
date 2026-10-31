/** jsdom has no layout, so the sheet's alignment is checked in the sources' CSS. */

import { describe, expect, it } from 'vitest'

import joinCodeSource from '../JoinCode.svelte?raw'
import scrollSource from './ClueScroll.svelte?raw'

function rule(source: string, selector: string): string {
  const start = source.indexOf(`\n  ${selector} {`)
  expect(start, selector).toBeGreaterThan(-1)
  return source.slice(start, source.indexOf('}', start))
}

describe('the sheet aligns its text', () => {
  it('centres the paper and never sets a sheet back to the left', () => {
    expect(rule(scrollSource, '.paper')).toContain('text-align: center')
    expect(scrollSource).not.toMatch(/text-align:\s*(left|start)/)
  })

  it('centres the lobby code and its actions', () => {
    expect(rule(joinCodeSource, '.code-row')).toContain('align-items: center')
    expect(rule(joinCodeSource, '.actions')).toContain('justify-content: center')
  })
})
