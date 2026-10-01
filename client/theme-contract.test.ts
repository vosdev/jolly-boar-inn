/**
 * A theme repaints the verdict and semantic tokens only inside its own block, where the
 * contrast check can see them; a rule anywhere else would slip past it.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const SRC = join(import.meta.dirname, 'src')

const sources = Object.fromEntries(
  readdirSync(SRC, { recursive: true, encoding: 'utf8' })
    .filter((path) => path.endsWith('.css') || path.endsWith('.svelte'))
    .map((path) => [path, readFileSync(join(SRC, path), 'utf8')]),
)

/** Every `selector { body }` in a stylesheet or a component's <style>, comments dropped. */
function rules(text: string): { selector: string; body: string }[] {
  const css = text.replace(/\/\*[\s\S]*?\*\//g, '')
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
    selector: (match[1] ?? '').trim(),
    body: match[2] ?? '',
  }))
}

describe.each(['party_room', 'tzhaar'])('%s', (theme) => {
  const own = `[data-theme='${theme}']`

  it('sets the verdict and semantic tokens nowhere but its own block', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(20)
    const contract = /--(ok|bad|warn)(-ink)?\s*:|--(more|less)\s*:/
    const strays = Object.entries(sources).flatMap(([path, text]) =>
      rules(text)
        .filter(({ selector }) => selector.includes(theme))
        .filter(({ selector }) => selector !== own)
        .filter(({ body }) => contract.test(body))
        .map(({ selector }) => `${path}: ${selector}`),
    )
    expect(strays).toEqual([])
  })

  it('has exactly one block of its own', () => {
    const blocks = Object.values(sources).flatMap((text) =>
      rules(text).filter(({ selector }) => selector === own),
    )
    expect(blocks).toHaveLength(1)
  })
})
