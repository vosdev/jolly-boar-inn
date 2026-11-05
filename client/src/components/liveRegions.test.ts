/** No live regions: 0.155.1 took the screen-reader announcements out, and none may come back. */

import { describe, expect, it } from 'vitest'

describe('components', () => {
  it('carry no aria-live and no status or alert role', () => {
    const sources = import.meta.glob<string>('../**/*.svelte', {
      query: '?raw',
      import: 'default',
      eager: true,
    })
    const live = Object.entries(sources)
      .filter(([, source]) => /aria-live|role="(status|alert)"/.test(source))
      .map(([path]) => path)
    expect(Object.keys(sources).length).toBeGreaterThan(50)
    expect(live).toEqual([])
  })
})
