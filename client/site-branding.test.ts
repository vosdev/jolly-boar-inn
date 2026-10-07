/**
 * What a selfhoster's three variables turn into at build time, and what a missing or
 * mistyped one falls back to.
 */

import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { beforeAll, describe, expect, it } from 'vitest'

import {
  BASE_URL_SLOT,
  DEFAULT_SITE_NAME,
  definedThemes,
  favicons,
  readBranding,
  retitle,
  shareTags,
  signSvg,
  themeColours,
} from './site-branding.ts'

let root: string

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'jbi-branding-'))
  mkdirSync(join(root, 'branding'))
  writeFileSync(join(root, 'branding/logo.png'), Buffer.from('not really a png'))
  writeFileSync(join(root, 'branding/logo.txt'), 'words')
  mkdirSync(join(root, 'branding/boar'))
  writeFileSync(join(root, 'branding/boar/logo.svg'), '<svg>jolly</svg>')
  writeFileSync(join(root, 'branding/boar/logo-tzhaar.svg'), '<svg>tzhaar</svg>')
  writeFileSync(join(root, 'branding/boar/logo-nowhere.svg'), '<svg>no such theme</svg>')
  writeFileSync(join(root, 'branding/boar/logo-wilderness.png'), 'not the logo’s format')
  writeFileSync(join(root, 'branding/boar/apple-touch-icon.png'), Buffer.from('a touch icon'))
  writeFileSync(join(root, 'branding/boar/og-card.png'), Buffer.from('a card'))
})

const BOAR = { PUBLIC_SITE_LOGO: 'branding/boar/logo.svg' }
const svgLogo = (file: string) => ({ file: join(root, file), extension: '.svg', type: 'image/svg+xml' })

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
        themeLogos: {},
        touchIcon: null,
        card: null,
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
      themeLogos: {},
      touchIcon: null,
      card: null,
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

  it('finds a logo per theme beside the logo, named for the theme, and the touch icon', () => {
    const branding = readBranding(BOAR, root)
    expect(branding.logo).toEqual(svgLogo('branding/boar/logo.svg'))
    expect(branding.themeLogos).toEqual({ tzhaar: svgLogo('branding/boar/logo-tzhaar.svg') })
    expect(branding.touchIcon).toEqual({
      file: join(root, 'branding/boar/apple-touch-icon.png'),
      extension: '.png',
      type: 'image/png',
    })
    expect(branding.card).toEqual({
      file: join(root, 'branding/boar/og-card.png'),
      extension: '.png',
      type: 'image/png',
    })
    expect(branding.warnings).toEqual([])
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
    expect(definedThemes()).toEqual(new Set(['jolly', 'pollnivneach', 'wilderness', 'party_room', 'tzhaar']))
  })
})

describe('the tab', () => {
  const THEMES = [...definedThemes()].sort()

  it('uses the one logo as every theme’s icon, in one file, when there is one', () => {
    const icons = favicons(readBranding(ALL_SET, root))
    expect(Object.keys(icons).sort()).toEqual(THEMES)
    for (const icon of Object.values(icons)) {
      expect(icon).toEqual({
        source: Buffer.from('not really a png'),
        type: 'image/png',
        fileName: 'favicon.png',
      })
    }
  })

  it('gives a theme with its own logo its own icon, and the rest the logo', () => {
    const icons = favicons(readBranding(BOAR, root))
    expect(icons.tzhaar).toEqual({
      source: Buffer.from('<svg>tzhaar</svg>'),
      type: 'image/svg+xml',
      fileName: 'favicon-tzhaar.svg',
    })
    expect(icons.jolly!.fileName).toBe('favicon.svg')
    expect(icons.jolly!.source.toString()).toBe('<svg>jolly</svg>')
  })

  it('draws the bundled sign otherwise, with the name’s letter, in each theme’s accent', () => {
    const colours = themeColours()
    const icons = favicons(readBranding({ PUBLIC_SITE_NAME: 'A Rusty Anchor' }, root))
    for (const theme of THEMES) {
      expect(icons[theme]!.fileName).toBe(`favicon-${theme}.svg`)
      expect(icons[theme]!.type).toBe('image/svg+xml')
      expect(icons[theme]!.source.toString()).toBe(signSvg('R', colours[theme]))
    }
    expect(colours.jolly).toEqual({
      line: '#8c6a34',
      accent: '#2f6e25',
      accentHover: '#245a1c',
      accentInk: '#f7f1dc',
    })
    expect(icons.tzhaar!.source.toString()).toContain('fill="#ff9a2e"')
    expect(signSvg('<')).toContain('>&lt;</text>')
  })

  it('is titled with the name, escaped', () => {
    expect(retitle('<head><title>The Jolly Boar Inn</title></head>', 'Fish & <Chips>')).toBe(
      '<head><title>Fish &amp; &lt;Chips&gt;</title></head>',
    )
  })
})

describe('a shared link', () => {
  const meta = (tags: ReturnType<typeof shareTags>) =>
    Object.fromEntries(tags.map(({ attrs }) => [attrs!.property ?? attrs!.name, attrs!.content]))

  it('is titled and described with the site’s name, and has no image without a card', () => {
    expect(meta(shareTags(readBranding({ PUBLIC_SITE_NAME: 'The Dancing Donkey' }, root)))).toEqual({
      'og:type': 'website',
      'og:site_name': 'The Dancing Donkey',
      'og:title': 'The Dancing Donkey',
      'og:description': 'Think you know Gielinor? Prove it at The Dancing Donkey.',
      'twitter:card': 'summary',
    })
    expect(meta(shareTags(readBranding(ALL_SET, root)))).not.toHaveProperty('og:image')
  })

  it('shows the card beside the logo, large, at the address the server fills in', () => {
    const tags = meta(shareTags(readBranding(BOAR, root)))
    expect(tags['og:image']).toBe(`${BASE_URL_SLOT}/og-card.png`)
    expect(tags['og:image:width']).toBe('1200')
    expect(tags['og:image:height']).toBe('630')
    expect(tags['twitter:card']).toBe('summary_large_image')
  })
})
