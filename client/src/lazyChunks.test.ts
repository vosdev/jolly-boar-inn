/**
 * The first chunk is what a guest downloads on the join link, so the operator's pages, the
 * suggestion and report forms, past games and the changelog must stay behind `import()`.
 * A static import anywhere in the shell would pull them back in without any other test
 * noticing.
 */

import { describe, expect, it } from 'vitest'

import app from './App.svelte?raw'
import footer from './components/Footer.svelte?raw'

describe('lazy chunks', () => {
  it.each(['Admin', 'Suggest', 'Report', 'History'])('loads %s on demand', (name) => {
    expect(app).not.toMatch(new RegExp(`^\\s*import ${name} from`, 'm'))
    expect(app).toContain(`import('./routes/${name}.svelte')`)
  })

  it('loads the changelog on demand', () => {
    expect(footer).not.toMatch(/^\s*import Changelog from/m)
    expect(footer).toContain("import('./Changelog.svelte')")
  })

  it.each(['Home', 'Join', 'Room', 'Create', 'Daily'])('keeps %s in the first chunk', (name) => {
    expect(app).toMatch(new RegExp(`^\\s*import ${name} from`, 'm'))
  })
})
