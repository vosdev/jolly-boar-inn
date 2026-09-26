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
 * The same plugin names the tab and draws its icon: the logo when there is one, else
 * the bundled sign as a static SVG. An icon cannot see the theme's custom properties, so
 * that sign is always in `jolly`'s colours.
 */

import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { loadEnv, type Plugin } from 'vite'

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
  /** As configured, `''` when unset; the page decides whether it names a theme. */
  defaultTheme: string
  warnings: string[]
}

/** The themes `app.css` paints, by their `[data-theme='…']` selectors. */
export function definedThemes(css = readFileSync(APP_CSS, 'utf8')): Set<string> {
  return new Set([...css.matchAll(/\[data-theme='([a-z_]+)'\]/g)].map((match) => match[1]))
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

  const initial = name.replace(/^(the|a|an)\s+/i, '').trim().charAt(0).toUpperCase()
  return { name, initial, logo, defaultTheme, warnings }
}

function escapeXml(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!,
  )
}

/** The bundled sign as an icon file, in `jolly`'s tokens as `app.css` has them. */
export function signSvg(initial: string): string {
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">',
    '<path d="M16 2v5" fill="none" stroke="#8c6a34" stroke-width="2"/>',
    '<rect x="3" y="7" width="26" height="20" rx="4" fill="#2f6e25" stroke="#245a1c" stroke-width="2"/>',
    '<text x="16" y="18" text-anchor="middle" dominant-baseline="central" fill="#f7f1dc"',
    ` font-family="system-ui, sans-serif" font-size="15" font-weight="700">${escapeXml(initial)}</text>`,
    '</svg>',
  ].join('')
}

/** The icon's bytes, its type, and the name it is served under. */
export function favicon(branding: Branding): { source: Buffer; type: string; fileName: string } {
  if (branding.logo !== null) {
    const { file, type, extension } = branding.logo
    return { source: readFileSync(file), type, fileName: `favicon${extension}` }
  }
  return {
    source: Buffer.from(signSvg(branding.initial)),
    type: IMAGE_TYPES['.svg']!,
    fileName: 'favicon.svg',
  }
}

/** `index.html` with the site's name as its title. */
export function retitle(html: string, name: string): string {
  return html.replace(/<title>[^<]*<\/title>/, `<title>${escapeXml(name)}</title>`)
}

export function siteBranding(): Plugin {
  let serving = false
  let branding: Branding = readBranding({})
  return {
    name: 'jbi-site-branding',
    configResolved(config) {
      serving = config.command === 'serve'
      // Tests draw the stock inn whatever a developer's `.env` says, so they pass anywhere.
      const env = config.mode === 'test' ? {} : loadEnv(config.mode, ROOT, VARS)
      branding = readBranding(env)
      for (const warning of branding.warnings) config.logger.warn(warning)
    },
    buildStart() {
      if (serving) return
      const icon = favicon(branding)
      this.emitFile({ type: 'asset', fileName: icon.fileName, source: icon.source })
    },
    resolveId(id) {
      return id === VIRTUAL ? RESOLVED : null
    },
    load(id) {
      if (id !== RESOLVED) return null
      let logo = 'null'
      if (branding.logo !== null) {
        const { file, extension, type } = branding.logo
        this.addWatchFile(file)
        const source = readFileSync(file)
        if (serving) {
          logo = JSON.stringify(`data:${type};base64,${source.toString('base64')}`)
        } else {
          const ref = this.emitFile({ type: 'asset', name: `logo${extension}`, source })
          logo = `import.meta.ROLLUP_FILE_URL_${ref}`
        }
      }
      return [
        `export const siteName = ${JSON.stringify(branding.name)}`,
        `export const initial = ${JSON.stringify(branding.initial)}`,
        `export const logo = ${logo}`,
        `export const defaultTheme = ${JSON.stringify(branding.defaultTheme)}`,
      ].join('\n')
    },
    transformIndexHtml(html) {
      const icon = favicon(branding)
      const href = serving
        ? `data:${icon.type};base64,${icon.source.toString('base64')}`
        : `/${icon.fileName}`
      return {
        html: retitle(html, branding.name),
        tags: [{ tag: 'link', attrs: { rel: 'icon', type: icon.type, href }, injectTo: 'head' }],
      }
    },
  }
}
