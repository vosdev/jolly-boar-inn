/**
 * `virtual:branding`: a selfhoster's name, logo and default theme, fixed at build time.
 *
 * Three variables, read from the environment or the repo root's `.env`:
 * `PUBLIC_SITE_NAME`, `PUBLIC_SITE_LOGO` (an image path relative to the repo root) and
 * `PUBLIC_DEFAULT_THEME`. They are read by name here rather than through Vite's
 * `envPrefix`, which matches on prefixes and would hand the page `PUBLIC_BASE_URL` too.
 *
 * Nothing about a misconfiguration stops the build: a logo that is missing or not an
 * image is a warning and the bundled sign, and a theme `app.css` does not define is a
 * warning here and `jolly` in the page (`lib/theme.ts`), which is what decides.
 *
 * Beside the logo, a file named for it and a theme (`logo.svg`, `logo-tzhaar.svg`) is that
 * theme's logo, and an `apple-touch-icon.png` is the home-screen icon. A selfhoster with
 * one logo sets nothing more.
 *
 * The same plugin names the tab and draws its icon, one per theme, which `lib/theme.ts`
 * swaps in with the theme: the theme's logo, else the logo, else the bundled sign as a
 * static SVG. An icon cannot see the theme's custom properties, so each theme's sign is
 * drawn in that theme's accent colours as `app.css` has them.
 */

import { existsSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { loadEnv, type HtmlTagDescriptor, type Plugin } from 'vite'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const APP_CSS = resolve(HERE, 'src/app.css')
const VIRTUAL = 'virtual:branding'
const RESOLVED = '\0' + VIRTUAL

export const DEFAULT_SITE_NAME = 'The Jolly Boar Inn'
const VARS = ['PUBLIC_SITE_NAME', 'PUBLIC_SITE_LOGO', 'PUBLIC_DEFAULT_THEME']

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
    const token = (name: string) => body!.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1]?.trim() ?? ''
    colours[theme!] = {
      line: token('line'),
      accent: token('accent'),
      accentHover: token('accent-hover'),
      accentInk: token('accent-ink'),
    }
  }
  return colours
}

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
      warnings.push(`PUBLIC_SITE_LOGO: ${file} is not a png, svg, webp, gif, jpg or ico; using the bundled sign`)
    } else {
      logo = { file, extension, type }
    }
  }

  const themeLogos: Record<string, Logo> = {}
  let touchIcon: Logo | null = null
  if (logo !== null) {
    const stem = join(dirname(logo.file), basename(logo.file, extname(logo.file)))
    for (const theme of [...themes].sort()) {
      // The logo's own extension only: a theme's logo is the same kind of picture redrawn.
      const own = imageAt(`${stem}-${theme}${logo.extension}`)
      if (own !== null) themeLogos[theme] = own
    }
    touchIcon = imageAt(join(dirname(logo.file), 'apple-touch-icon.png'))
  }

  const initial = name.replace(/^(the|a|an)\s+/i, '').trim().charAt(0).toUpperCase()
  return { name, initial, logo, themeLogos, touchIcon, defaultTheme, warnings }
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
      icons[theme] = { source: readFileSync(own.file), type: own.type, fileName: `favicon-${theme}${own.extension}` }
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

/** The touch icon as it is served: always this name, which phones also look for unasked. */
const TOUCH_ICON = 'apple-touch-icon.png'

/** `index.html` with the site's name as its title. */
export function retitle(html: string, name: string): string {
  return html.replace(/<title>[^<]*<\/title>/, `<title>${escapeXml(name)}</title>`)
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
    buildStart() {
      if (serving) return
      const emitted = new Set<string>()
      for (const icon of Object.values(icons)) {
        if (emitted.has(icon.fileName)) continue
        emitted.add(icon.fileName)
        this.emitFile({ type: 'asset', fileName: icon.fileName, source: icon.source })
      }
      if (branding.touchIcon !== null) {
        const source = readFileSync(branding.touchIcon.file)
        this.emitFile({ type: 'asset', fileName: TOUCH_ICON, source })
      }
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
      const logos = Object.entries(branding.themeLogos).map(
        ([theme, image]) => `${JSON.stringify(theme)}: ${url(image, `logo-${theme}`)}`,
      )
      const tabIcons = Object.fromEntries(
        Object.entries(icons).map(([theme, icon]) => [theme, { href: iconHref(icon), type: icon.type }]),
      )
      return [
        `export const siteName = ${JSON.stringify(branding.name)}`,
        `export const initial = ${JSON.stringify(branding.initial)}`,
        `export const logo = ${logo}`,
        `export const logos = {${logos.join(', ')}}`,
        `export const favicons = ${JSON.stringify(tabIcons)}`,
        `export const defaultTheme = ${JSON.stringify(branding.defaultTheme)}`,
      ].join('\n')
    },
    transformIndexHtml(html) {
      // The theme a first visit paints; `lib/theme.ts` swaps the icon for a stored one.
      const first = icons[branding.defaultTheme] ?? icons.jolly!
      const tags: HtmlTagDescriptor[] = [
        { tag: 'link', attrs: { rel: 'icon', type: first.type, href: iconHref(first) }, injectTo: 'head' },
      ]
      if (branding.touchIcon !== null) {
        const touch = { source: readFileSync(branding.touchIcon.file), type: 'image/png', fileName: TOUCH_ICON }
        tags.push({ tag: 'link', attrs: { rel: 'apple-touch-icon', href: iconHref(touch) }, injectTo: 'head' })
      }
      return { html: retitle(html, branding.name), tags }
    },
  }
}
