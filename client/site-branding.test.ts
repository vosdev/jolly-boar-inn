/**
 * What a selfhoster's three variables turn into at build time, and what a missing or
 * mistyped one falls back to.
 */

import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { beforeAll, describe, expect, it } from 'vitest'

import {
  BASE_URL_SLOT,
  DEFAULT_SITE_NAME,
  FARO_URL_SLOT,
  faroTag,
  definedThemes,
  favicons,
  loadSeoModes,
  loadTriviaQuestions,
  readBranding,
  retitle,
  seoManifest,
  shareTags,
  signSvg,
  themeColours,
} from './site-branding.ts'
import { RANDOM_EVENTS } from './src/lib/randomEvents.ts'
import {
  DAILY_INTRO,
  EVENTS_INTRO,
  HOME_DESCRIPTION,
  NOT_SHOWN_MODES,
  TRIVIA_PATH,
} from './src/lib/seo.ts'
import { WAYS_TO_PLAY } from './src/lib/waysToPlay.ts'

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
  writeFileSync(join(root, 'branding/boar/hero.svg'), '<svg>hero</svg>')
  writeFileSync(join(root, 'branding/boar/hero-tzhaar.svg'), '<svg>tzhaar hero</svg>')
  writeFileSync(join(root, 'branding/boar/hero-wilderness.png'), 'not the hero’s format')
})

const BOAR = { PUBLIC_SITE_LOGO: 'branding/boar/logo.svg' }
const svgLogo = (file: string) => ({
  file: join(root, file),
  extension: '.svg',
  type: 'image/svg+xml',
})

const ALL_SET = {
  PUBLIC_SITE_NAME: 'The Dancing Donkey',
  PUBLIC_SITE_LOGO: 'branding/logo.png',
  PUBLIC_HERO_NAME: ' Broav ',
  PUBLIC_DEFAULT_THEME: 'wilderness',
}

describe('readBranding', () => {
  it('is the stock inn with nothing set, or with everything set blank', () => {
    for (const env of [
      {},
      {
        PUBLIC_SITE_NAME: ' ',
        PUBLIC_SITE_LOGO: '',
        PUBLIC_HERO_NAME: ' ',
        PUBLIC_DEFAULT_THEME: '',
      },
    ]) {
      expect(readBranding(env, root)).toEqual({
        name: DEFAULT_SITE_NAME,
        initial: 'J',
        logo: null,
        themeLogos: {},
        touchIcon: null,
        card: null,
        hero: null,
        themeHeroes: {},
        heroName: '',
        defaultTheme: '',
        warnings: [],
      })
    }
  })

  it('takes all four when all four are set', () => {
    expect(readBranding(ALL_SET, root)).toEqual({
      name: 'The Dancing Donkey',
      initial: 'D',
      logo: { file: join(root, 'branding/logo.png'), extension: '.png', type: 'image/png' },
      themeLogos: {},
      touchIcon: null,
      card: null,
      hero: null,
      themeHeroes: {},
      heroName: 'Broav',
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

  it('finds the hero beside the logo, and one per theme in the hero’s own format', () => {
    const branding = readBranding(BOAR, root)
    expect(branding.hero).toEqual(svgLogo('branding/boar/hero.svg'))
    expect(branding.themeHeroes).toEqual({ tzhaar: svgLogo('branding/boar/hero-tzhaar.svg') })
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
    expect(definedThemes()).toEqual(
      new Set([
        'jolly',
        'pollnivneach',
        'wilderness',
        'party_room',
        'zanaris',
        'tzhaar',
        'jungle',
        'prifddinas',
        'morytania',
      ]),
    )
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
    expect(meta(shareTags(readBranding({ PUBLIC_SITE_NAME: 'The Dancing Donkey' }, root)))).toEqual(
      {
        description: HOME_DESCRIPTION,
        'og:type': 'website',
        'og:site_name': 'The Dancing Donkey',
        'og:title': 'The Dancing Donkey — OSRS Party Trivia Game',
        'og:description': HOME_DESCRIPTION,
        'twitter:card': 'summary',
      },
    )
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

describe('SEO manifest', () => {
  it('loads every built public mode in registry order and lists it in the sitemap', async () => {
    const modes = await loadSeoModes()
    expect(modes.length).toBeGreaterThanOrEqual(20)
    for (const hidden of NOT_SHOWN_MODES) {
      expect(modes.some((mode) => mode.id === hidden)).toBe(false)
    }
    const manifest = seoManifest(readBranding(BOAR, root), modes)
    expect(manifest.site_name).toBe(DEFAULT_SITE_NAME)
    expect(manifest.has_card).toBe(true)
    const paths = manifest.routes.map((route) => route.path)
    expect(paths.slice(0, 5)).toEqual([
      '/',
      '/daily',
      '/create',
      '/how-to-play',
      '/how-to-play/random-events',
    ])
    expect(paths).toContain('/how-to-play/more-or-less')
    expect(paths).toContain('/how-to-play/the-price-is-right')
    const sitemapPaths = manifest.routes.filter((route) => route.sitemap).map((route) => route.path)
    expect(sitemapPaths).toContain('/daily')
    expect(sitemapPaths).toContain('/how-to-play/more-or-less')
    expect(sitemapPaths).not.toContain('/suggest')
    expect(sitemapPaths).not.toContain('/report')
    expect(manifest.routes.find((route) => route.path === '/report')?.noindex).toBe(true)
  })
})

describe('SEO manifest copy', () => {
  it('gives every indexable page a heading, its words and links a crawler can follow', async () => {
    const modes = await loadSeoModes()
    const manifest = seoManifest(readBranding(BOAR, root), modes)
    const byPath = new Map(manifest.routes.map((route) => [route.path, route]))
    for (const route of manifest.routes) {
      if (route.noindex) expect(route.copy, route.path).toBeUndefined()
      else expect(route.copy?.heading, route.path).toBeTruthy()
    }
    expect(byPath.get('/')?.copy?.links.map((link) => link.path)).toEqual([
      '/daily',
      '/create',
      '/how-to-play',
    ])
    expect(byPath.get('/daily')?.copy?.paragraphs).toEqual([DAILY_INTRO])

    const howTo = byPath.get('/how-to-play')?.copy
    expect(howTo?.paragraphs).toEqual(WAYS_TO_PLAY.map((way) => `${way.title}: ${way.text}`))
    const modePaths = manifest.routes
      .filter((route) => route.breadcrumb !== undefined)
      .map((route) => route.path)
    expect(howTo?.links.map((link) => link.path).sort()).toEqual(modePaths.sort())

    const events = byPath.get('/how-to-play/random-events')?.copy
    expect(events?.paragraphs).toContain(EVENTS_INTRO)
    expect(events?.paragraphs).toContain(`${RANDOM_EVENTS[0]!.name}: ${RANDOM_EVENTS[0]!.theme}`)

    const moreLess = byPath.get('/how-to-play/more-or-less')?.copy
    expect(moreLess?.heading).toBe('More or Less')
    expect(moreLess?.paragraphs[0]).toBe('Hosted by Ali Morrisane')
  })

  it('lists the trivia questions page with every question and answer in its copy', async () => {
    const questions = await loadTriviaQuestions()
    expect(questions.length).toBeGreaterThanOrEqual(15)
    const manifest = seoManifest(readBranding(BOAR, root), await loadSeoModes(), questions)
    const trivia = manifest.routes.find((route) => route.path === TRIVIA_PATH)!
    expect(trivia.sitemap).toBe(true)
    const words = trivia.copy!.paragraphs.join('\n')
    for (const question of questions) {
      expect(words).toContain(`${question.label}: ${question.question}`)
      expect(words).toContain(`Answer: ${question.answer}.`)
    }
    expect(trivia.copy!.links.map((link) => link.path)).toContain('/how-to-play/bestiary')
    expect(questions.some((question) => question.mode === 'pixel_hunt')).toBe(false)
  })

  it('shows the copy only with scripts off', () => {
    const html = readFileSync(join(import.meta.dirname, 'index.html'), 'utf-8')
    expect(html).toContain('<noscript><link rel="stylesheet" href="/prerender.css" /></noscript>')
    const css = readFileSync(join(import.meta.dirname, 'public/prerender.css'), 'utf-8')
    expect(css).toMatch(/html \.prerender \{[^}]*display: block/)
    const app = readFileSync(join(import.meta.dirname, 'src/app.css'), 'utf-8')
    expect(app).toMatch(/\.prerender \{\s*display: none;/)
  })
})

describe('faroTag', () => {
  it('leaves the slot the server fills and lib/faro.ts reads', () => {
    expect(faroTag.attrs).toEqual({ name: 'faro-url', content: FARO_URL_SLOT })
    const faro = readFileSync(join(import.meta.dirname, 'src/lib/faro.ts'), 'utf-8')
    expect(faro).toContain(`const SLOT = '${FARO_URL_SLOT}'`)
  })
})
