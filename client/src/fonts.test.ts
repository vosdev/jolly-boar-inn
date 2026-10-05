/** The clue scroll's pixel font ships in the repo, and the scroll asks for it. */

import { describe, expect, it } from 'vitest'

import fontUrl from './assets/fonts/RuneScape-Quill-8.ttf?url'
import scroll from './components/stage/ClueScroll.svelte?raw'

describe('RuneScape font', () => {
  it('is committed next to the stylesheet', () => {
    expect(fontUrl).toContain('RuneScape-Quill-8')
  })

  it('is used on the clue scroll with the body font behind it', () => {
    expect(scroll).toContain("--font-display: 'RuneScape', var(--font-body)")
  })
})
