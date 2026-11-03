import { describe, expect, it } from 'vitest'
import source from './SuggestionEditor.svelte?raw'

const style = source.slice(source.indexOf('<style>'))

/** The body of one rule in the editor's `<style>`, at the given indent. */
function rule(selector: string, indent = '  '): string {
  const start = style.indexOf(`\n${indent}${selector} {`)
  expect(start).toBeGreaterThan(-1)
  return style.slice(start, style.indexOf('}', start))
}

describe('SuggestionEditor layout', () => {
  it('stacks every form on a phone and sets the preview beside the fields on a wide editor', () => {
    expect(source).not.toMatch(/class="editor surface place"/)
    expect(rule('.editor')).toContain('container-type: inline-size;')
    expect(rule('.layout')).toContain('grid-template-columns: minmax(0, 1fr);')
    const wide = style.slice(style.indexOf('@container (min-width: 40rem)'))
    expect(wide.slice(0, wide.indexOf('\n  }'))).toMatch(
      /\.layout:not\(\.stacks\) \{\s*grid-template-columns: 3fr 2fr;/,
    )
    const map = style.slice(style.indexOf('@container (min-width: 46rem)'))
    expect(map.slice(0, map.indexOf('\n  }'))).toMatch(
      /\.layout\.stacks \{\s*grid-template-columns: 3fr 2fr;/,
    )
  })
})
