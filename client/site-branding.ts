/**
 * `virtual:branding`: a selfhoster's name, logo and default theme, fixed at build time.
 *
 * Four variables, read from the environment or the repo root's `.env`:
 * `PUBLIC_SITE_NAME`, `PUBLIC_SITE_LOGO` (an image path relative to the repo root),
 * `PUBLIC_HERO_NAME` and `PUBLIC_DEFAULT_THEME`. They are read by name here rather than through Vite's
 * `envPrefix`, which matches on prefixes and would hand the page `PUBLIC_BASE_URL` too.
 *
 * Nothing about a misconfiguration stops the build: a logo that is missing or not an
 * image is a warning and the bundled sign, and a theme `app.css` does not define is a
 * warning here and `jolly` in the page (`lib/theme.ts`), which is what decides.
 *
 * Beside the logo, a file named for it and a theme (`logo.svg`, `logo-tzhaar.svg`) is that
 * theme's logo, an `apple-touch-icon.png` is the home-screen icon, an `og-card.png` is
 * the picture a shared link shows, and a `hero` (with a `hero-<theme>` per theme) stands
 * on Home's stage instead of the Wise Old Man, named by `PUBLIC_HERO_NAME` or else the site's name.
 * A selfhoster with one logo sets nothing more.
 *
 * The same plugin names the tab and draws its icon, one per theme, which `lib/theme.ts`
 * swaps in with the theme: the theme's logo, else the logo, else the bundled sign as a
 * static SVG. An icon cannot see the theme's custom properties, so each theme's sign is
 * drawn in that theme's accent colours as `app.css` has them.
 */

import { existsSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { loadEnv, type HtmlTagDescriptor, type Plugin } from 'vite'

import {
  HOME_DESCRIPTION,
  NOT_SHOWN_MODES,
  SEO_MANIFEST,
  homeTitle,
  seoRoutes,
  type SeoManifest,
  type SeoMode,
} from './src/lib/seo.ts'
import { RANDOM_EVENTS } from './src/lib/randomEvents.ts'
import { WAYS_TO_PLAY } from './src/lib/waysToPlay.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const APP_CSS = resolve(HERE, 'src/app.css')
const VIRTUAL = 'virtual:branding'
const RESOLVED = '\0' + VIRTUAL

export const DEFAULT_SITE_NAME = 'The Jolly Boar Inn'
const VARS = ['PUBLIC_SITE_NAME', 'PUBLIC_SITE_LOGO', 'PUBLIC_HERO_NAME', 'PUBLIC_DEFAULT_THEME']

const IMAGE_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
}

export interface Logo {
  file: string
  extension: string
  type: string
}

export interface Branding {
  name: string
  /** The sign's letter. A leading article is not what an inn is called. */
  initial: string
  logo: Logo | null
  /** The logos beside `logo` named for a theme, by theme. */
  themeLogos: Record<string, Logo>
  /** `apple-touch-icon.png` beside `logo`: a phone's home-screen icon. */
  touchIcon: Logo | null
  /** `og-card.png` beside `logo`: what a shared link shows, 1200×630. */
  card: Logo | null
  /** `hero.<ext>` beside `logo`: who stands on Home's stage. */
  hero: Logo | null
  /** The heroes beside `hero` named for a theme, by theme. */
  themeHeroes: Record<string, Logo>
  /** What the hero is called in the dialogue box, `''` when unset. */
  heroName: string
  /** As configured, `''` when unset; the page decides whether it names a theme. */
  defaultTheme: string
  warnings: string[]
}

/** The themes `app.css` paints, by their `[data-theme='…']` selectors. */
export function definedThemes(css = readFileSync(APP_CSS, 'utf8')): Set<string> {
  return new Set([...css.matchAll(/\[data-theme='([a-z_]+)'\]/g)].map((match) => match[1]))
}

/** What the bundled sign is drawn in. */
export interface SignColours {
  line: string
  accent: string
  accentHover: string
  accentInk: string
}

/** Each theme's sign colours, from the tokens its block in `app.css` sets. */
export function themeColours(css = readFileSync(APP_CSS, 'utf8')): Record<string, SignColours> {
  const colours: Record<string, SignColours> = {}
  for (const [, theme, body] of css.matchAll(/\[data-theme='([a-z_]+)'\]\s*\{([^}]*)\}/g)) {
    const token = (name: string) =>
      body!.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1]?.trim() ?? ''
    colours[theme!] = {
      line: token('line'),
      accent: token('accent'),
      accentHover: token('accent-hover'),
      accentInk: token('accent-ink'),
    }
  }
  return colours
}

/** The touch icon as it is served: always this name, which phones also look for unasked. */
const TOUCH_ICON = 'apple-touch-icon.png'
/** The web manifest as it is served, built only: the dev server has no file to answer it with. */
export const WEB_MANIFEST = 'manifest.webmanifest'
/** The share card as it is served. */
const CARD = 'og-card.png'

/** `file` as a logo, or null when it is not there or not an image. */
function imageAt(file: string): Logo | null {
  const extension = extname(file).toLowerCase()
  const type = IMAGE_TYPES[extension]
  if (type === undefined || !existsSync(file) || !statSync(file).isFile()) return null
  return { file, extension, type }
}

/** The branding an environment asks for, with a warning for each thing it got wrong. */
export function readBranding(
  env: Record<string, string | undefined>,
  root = ROOT,
  themes = definedThemes(),
): Branding {
  const warnings: string[] = []
  const name = env.PUBLIC_SITE_NAME?.trim() || DEFAULT_SITE_NAME
  const heroName = env.PUBLIC_HERO_NAME?.trim() ?? ''
  const defaultTheme = env.PUBLIC_DEFAULT_THEME?.trim() ?? ''
  if (defaultTheme !== '' && !themes.has(defaultTheme)) {
    warnings.push(`PUBLIC_DEFAULT_THEME: there is no theme "${defaultTheme}"; using jolly`)
  }

  let logo: Logo | null = null
  const path = env.PUBLIC_SITE_LOGO?.trim() ?? ''
  if (path !== '') {
    const file = resolve(root, path)
    const extension = extname(file).toLowerCase()
    const type = IMAGE_TYPES[extension]
    if (!existsSync(file) || !statSync(file).isFile()) {
      warnings.push(`PUBLIC_SITE_LOGO: ${file} does not exist; using the bundled sign`)
    } else if (type === undefined) {
      warnings.push(
        `PUBLIC_SITE_LOGO: ${file} is not a png, svg, webp, gif, jpg or ico; using the bundled sign`,
      )
    } else {
      logo = { file, extension, type }
    }
  }

  const themeLogos: Record<string, Logo> = {}
  let touchIcon: Logo | null = null
  let card: Logo | null = null
  let hero: Logo | null = null
  const themeHeroes: Record<string, Logo> = {}
  if (logo !== null) {
    const folder = dirname(logo.file)
    // The base's own extension only: a theme's version is the same kind of picture redrawn.
    const perTheme = (base: Logo, into: Record<string, Logo>) => {
      const stem = join(dirname(base.file), basename(base.file, base.extension))
      for (const theme of [...themes].sort()) {
        const own = imageAt(`${stem}-${theme}${base.extension}`)
        if (own !== null) into[theme] = own
      }
    }
    perTheme(logo, themeLogos)
    touchIcon = imageAt(join(folder, TOUCH_ICON))
    card = imageAt(join(folder, CARD))
    for (const extension of Object.keys(IMAGE_TYPES)) {
      hero ??= imageAt(join(folder, `hero${extension}`))
    }
    if (hero !== null) perTheme(hero, themeHeroes)
  }

  const initial = name
    .replace(/^(the|a|an)\s+/i, '')
    .trim()
    .charAt(0)
    .toUpperCase()
  return {
    name,
    initial,
    logo,
    themeLogos,
    touchIcon,
    card,
    hero,
    themeHeroes,
    heroName,
    defaultTheme,
    warnings,
  }
}

function escapeXml(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!,
  )
}

const JOLLY: SignColours = {
  line: '#8c6a34',
  accent: '#2f6e25',
  accentHover: '#245a1c',
  accentInk: '#f7f1dc',
}

/** The bundled sign as an icon file, in a theme's sign colours (`jolly`'s by default). */
export function signSvg(initial: string, colours: SignColours = JOLLY): string {
  const { line, accent, accentHover, accentInk } = colours
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">',
    `<path d="M16 2v5" fill="none" stroke="${line}" stroke-width="2"/>`,
    `<rect x="3" y="7" width="26" height="20" rx="4" fill="${accent}" stroke="${accentHover}" stroke-width="2"/>`,
    `<text x="16" y="18" text-anchor="middle" dominant-baseline="central" fill="${accentInk}"`,
    ` font-family="system-ui, sans-serif" font-size="15" font-weight="700">${escapeXml(initial)}</text>`,
    '</svg>',
  ].join('')
}

/** An icon's bytes, its type, and the name it is served under. */
export interface Icon {
  source: Buffer
  type: string
  fileName: string
}

/**
 * Each theme's tab icon. Themes that show the same logo share its one file, so a
 * selfhoster with one logo still serves one icon.
 */
export function favicons(branding: Branding, colours = themeColours()): Record<string, Icon> {
  const icons: Record<string, Icon> = {}
  for (const theme of Object.keys(colours).sort()) {
    const own = branding.themeLogos[theme]
    if (own !== undefined) {
      icons[theme] = {
        source: readFileSync(own.file),
        type: own.type,
        fileName: `favicon-${theme}${own.extension}`,
      }
    } else if (branding.logo !== null) {
      const { file, type, extension } = branding.logo
      icons[theme] = { source: readFileSync(file), type, fileName: `favicon${extension}` }
    } else {
      icons[theme] = {
        source: Buffer.from(signSvg(branding.initial, colours[theme])),
        type: IMAGE_TYPES['.svg']!,
        fileName: `favicon-${theme}.svg`,
      }
    }
  }
  return icons
}

/**
 * Where the server writes `PUBLIC_BASE_URL` into `index.html` (`server/app/static.py`): a
 * shared link's image has to be absolute, and only the running server knows its address.
 */
export const BASE_URL_SLOT = '__PUBLIC_BASE_URL__'

/**
 * Where the server writes `FARO_URL` (`server/app/static.py`), empty when it is off. A
 * runtime setting, because the CSP that has to allow the receiver is the server's.
 */
export const FARO_URL_SLOT = '__FARO_URL__'

/** The tag `lib/faro.ts` reads the receiver's address from. */
export const faroTag: HtmlTagDescriptor = {
  tag: 'meta',
  attrs: { name: 'faro-url', content: FARO_URL_SLOT },
  injectTo: 'head',
}

/** What a search snippet and shared link say, and the card a link shows when the selfhoster has one. */
export function shareTags(branding: Branding): HtmlTagDescriptor[] {
  const meta = (key: 'property' | 'name', value: string, content: string): HtmlTagDescriptor => ({
    tag: 'meta',
    attrs: { [key]: value, content },
    injectTo: 'head',
  })
  const title = homeTitle(branding.name)
  const tags = [
    meta('name', 'description', HOME_DESCRIPTION),
    meta('property', 'og:type', 'website'),
    meta('property', 'og:site_name', branding.name),
    meta('property', 'og:title', title),
    meta('property', 'og:description', HOME_DESCRIPTION),
  ]
  if (branding.card === null) return [...tags, meta('name', 'twitter:card', 'summary')]
  return [
    ...tags,
    meta('property', 'og:image', `${BASE_URL_SLOT}/${CARD}`),
    meta('property', 'og:image:width', '1200'),
    meta('property', 'og:image:height', '630'),
    meta('property', 'og:image:alt', branding.name),
    meta('name', 'twitter:card', 'summary_large_image'),
  ]
}

/** Built modes shown in How to play, in `schema/modes.json` order. */
export async function loadSeoModes(root = ROOT): Promise<SeoMode[]> {
  const schema = JSON.parse(readFileSync(join(root, 'schema/modes.json'), 'utf8')) as {
    modes: { id: string }[]
  }
  const modes: SeoMode[] = []
  for (const entry of schema.modes) {
    if (NOT_SHOWN_MODES.has(entry.id)) continue
    const file = join(root, 'client/src/lib/modes', `${entry.id}.ts`)
    if (!existsSync(file)) continue
    const loaded = (await import(pathToFileURL(file).href)) as { mode?: SeoMode }
    if (loaded.mode === undefined) continue
    modes.push({
      id: loaded.mode.id,
      label: loaded.mode.label,
      hint: loaded.mode.hint,
      blurb: loaded.mode.blurb,
      host: { name: loaded.mode.host.name },
    })
  }
  return modes
}

/** The route manifest emitted into `client/dist/` for `server/app/static.py`. */
export function seoManifest(branding: Branding, modes: readonly SeoMode[]): SeoManifest {
  return {
    site_name: branding.name,
    has_card: branding.card !== null,
    routes: seoRoutes(branding.name, modes, { ways: WAYS_TO_PLAY, events: RANDOM_EVENTS }),
  }
}

/**
 * What a phone's Home Screen opens: the game on its own, from Home, since a Home Screen app keeps
 * its own storage and so no seat in the room it was added from.
 */
export function webManifest(branding: Branding): Record<string, unknown> {
  return {
    name: branding.name,
    short_name: branding.name,
    start_url: '/',
    display: 'standalone',
    ...(branding.touchIcon === null
      ? {}
      : { icons: [{ src: `/${TOUCH_ICON}`, type: 'image/png' }] }),
  }
}

/** `index.html` with `title` as its document title. */
export function retitle(html: string, title: string): string {
  return html.replace(/<title>[^<]*<\/title>/, `<title>${escapeXml(title)}</title>`)
}

export function siteBranding(): Plugin {
  let serving = false
  let branding: Branding = readBranding({})
  let icons: Record<string, Icon> = {}

  // A data URL while serving, where nothing is emitted; the emitted file's path in a build.
  const iconHref = (icon: Icon) =>
    serving ? `data:${icon.type};base64,${icon.source.toString('base64')}` : `/${icon.fileName}`

  return {
    name: 'jbi-site-branding',
    configResolved(config) {
      serving = config.command === 'serve'
      // Tests draw the stock inn whatever a developer's `.env` says, so they pass anywhere.
      const env = config.mode === 'test' ? {} : loadEnv(config.mode, ROOT, VARS)
      branding = readBranding(env)
      icons = favicons(branding)
      for (const warning of branding.warnings) config.logger.warn(warning)
    },
    async buildStart() {
      if (serving) return
      const emitted = new Set<string>()
      for (const icon of Object.values(icons)) {
        if (emitted.has(icon.fileName)) continue
        emitted.add(icon.fileName)
        this.emitFile({ type: 'asset', fileName: icon.fileName, source: icon.source })
      }
      for (const [image, fileName] of [
        [branding.touchIcon, TOUCH_ICON],
        [branding.card, CARD],
      ] as const) {
        if (image !== null)
          this.emitFile({ type: 'asset', fileName, source: readFileSync(image.file) })
      }
      this.emitFile({
        type: 'asset',
        fileName: WEB_MANIFEST,
        source: `${JSON.stringify(webManifest(branding), null, 2)}\n`,
      })
      const manifest = seoManifest(branding, await loadSeoModes())
      this.emitFile({
        type: 'asset',
        fileName: SEO_MANIFEST,
        source: `${JSON.stringify(manifest, null, 2)}\n`,
      })
    },
    resolveId(id) {
      return id === VIRTUAL ? RESOLVED : null
    },
    load(id) {
      if (id !== RESOLVED) return null
      const url = (image: Logo, name: string): string => {
        this.addWatchFile(image.file)
        const source = readFileSync(image.file)
        if (serving) return JSON.stringify(`data:${image.type};base64,${source.toString('base64')}`)
        const ref = this.emitFile({ type: 'asset', name: `${name}${image.extension}`, source })
        return `import.meta.ROLLUP_FILE_URL_${ref}`
      }
      const logo = branding.logo === null ? 'null' : url(branding.logo, 'logo')
      const byTheme = (images: Record<string, Logo>, name: string) =>
        Object.entries(images).map(
          ([theme, image]) => `${JSON.stringify(theme)}: ${url(image, `${name}-${theme}`)}`,
        )
      const hero = branding.hero === null ? 'null' : url(branding.hero, 'hero')
      const tabIcons = Object.fromEntries(
        Object.entries(icons).map(([theme, icon]) => [
          theme,
          { href: iconHref(icon), type: icon.type },
        ]),
      )
      return [
        `export const siteName = ${JSON.stringify(branding.name)}`,
        `export const initial = ${JSON.stringify(branding.initial)}`,
        `export const logo = ${logo}`,
        `export const logos = {${byTheme(branding.themeLogos, 'logo').join(', ')}}`,
        `export const hero = ${hero}`,
        `export const heroes = {${byTheme(branding.themeHeroes, 'hero').join(', ')}}`,
        `export const heroName = ${JSON.stringify(branding.heroName)}`,
        `export const favicons = ${JSON.stringify(tabIcons)}`,
        `export const defaultTheme = ${JSON.stringify(branding.defaultTheme)}`,
      ].join('\n')
    },
    transformIndexHtml(html) {
      // The theme a first visit paints; `lib/theme.ts` swaps the icon for a stored one.
      const first = icons[branding.defaultTheme] ?? icons.jolly!
      const tags: HtmlTagDescriptor[] = [
        {
          tag: 'link',
          attrs: { rel: 'icon', type: first.type, href: iconHref(first) },
          injectTo: 'head',
        },
      ]
      if (branding.touchIcon !== null) {
        const touch = {
          source: readFileSync(branding.touchIcon.file),
          type: 'image/png',
          fileName: TOUCH_ICON,
        }
        tags.push({
          tag: 'link',
          attrs: { rel: 'apple-touch-icon', href: iconHref(touch) },
          injectTo: 'head',
        })
      }
      if (!serving) {
        tags.push({
          tag: 'link',
          attrs: { rel: 'manifest', href: `/${WEB_MANIFEST}` },
          injectTo: 'head',
        })
      }
      return {
        html: retitle(html, homeTitle(branding.name)),
        tags: [...tags, ...shareTags(branding), faroTag],
      }
    },
  }
}
