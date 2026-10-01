/**
 * What a selfhoster's three variables turn into at build time, and what a missing or
 * mistyped one falls back to.
 */

import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { beforeAll, describe, expect, it } from 'vitest'

import {
  DEFAULT_SITE_NAME,
  definedThemes,
  favicon,
  readBranding,
  retitle,
  signSvg,
} from './site-branding.ts'

let root: string

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'jbi-branding-'))
  mkdirSync(join(root, 'branding'))
  writeFileSync(join(root, 'branding/logo.png'), Buffer.from('not really a png'))
  writeFileSync(join(root, 'branding/logo.txt'), 'words')
})

const ALL_SET = {
  PUBLIC_SITE_NAME: 'The Dancing Donkey',
  PUBLIC_SITE_LOGO: 'branding/logo.png',
  PUBLIC_DEFAULT_THEME: 'wilderness',
}

describe('readBranding', () => {
  it('is the stock inn with nothing set, or with everything set blank', () => {
    for (const env of [{}, { PUBLIC_SITE_NAME: ' ', PUBLIC_SITE_LOGO: '', PUBLIC_DEFAULT_THEME: '' }]) {
      expect(readBranding(env, root)).toEqual({
        name: DEFAULT_SITE_NAME,
        initial: 'J',
        logo: null,
        defaultTheme: '',
        warnings: [],
      })
    }
  })

  it('takes all three when all three are set', () => {
    expect(readBranding(ALL_SET, root)).toEqual({
      name: 'The Dancing Donkey',
      initial: 'D',
      logo: { file: join(root, 'branding/logo.png'), extension: '.png', type: 'image/png' },
      defaultTheme: 'wilderness',
      warnings: [],
    })
  })

  it('warns and keeps the bundled sign for a logo that is missing or not an image', () => {
    for (const path of ['branding/nope.png', 'branding', 'branding/logo.txt']) {
      const branding = readBranding({ PUBLIC_SITE_LOGO: path }, root)
      expect(branding.logo).toBeNull()
      expect(branding.warnings).toHaveLength(1)
      expect(branding.warnings[0]).toMatch(/^PUBLIC_SITE_LOGO: .*bundled sign$/)
    }
  })

  it('warns about a theme app.css does not paint, and passes it on for the page to refuse', () => {
    const branding = readBranding({ PUBLIC_DEFAULT_THEME: 'party_hat' }, root)
    expect(branding.defaultTheme).toBe('party_hat')
    expect(branding.warnings).toEqual([
      'PUBLIC_DEFAULT_THEME: there is no theme "party_hat"; using jolly',
    ])
  })
})

describe('definedThemes', () => {
  it('finds every theme app.css paints', () => {
    expect(definedThemes()).toEqual(new Set(['jolly', 'pollnivneach', 'wilderness', 'party_room']))
  })
})

describe('the tab', () => {
  it('uses the logo as its icon when there is one', () => {
    const icon = favicon(readBranding(ALL_SET, root))
    expect(icon).toEqual({
      source: Buffer.from('not really a png'),
      type: 'image/png',
      fileName: 'favicon.png',
    })
  })

  it('draws the bundled sign as its icon otherwise, with the name’s letter', () => {
    const icon = favicon(readBranding({ PUBLIC_SITE_NAME: 'A Rusty Anchor' }, root))
    expect(icon.fileName).toBe('favicon.svg')
    expect(icon.type).toBe('image/svg+xml')
    expect(icon.source.toString()).toBe(signSvg('R'))
    expect(signSvg('<')).toContain('>&lt;</text>')
  })

  it('is titled with the name, escaped', () => {
    expect(retitle('<head><title>The Jolly Boar Inn</title></head>', 'Fish & <Chips>')).toBe(
      '<head><title>Fish &amp; &lt;Chips&gt;</title></head>',
    )
  })
})
