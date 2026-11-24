/**
 * Per-route titles, descriptions and sitemap entries, shared between the Vite build
 * (`site-branding.ts`, which emits `.seo.json` for `server/app/static.py`) and the
 * client router (`App.svelte`). Pure ES2023 so both Node and the browser bundle load it.
 */

/** Build manifest written into `client/dist/` for `server/app/static.py`, never served publicly. */
export const SEO_MANIFEST = '.seo.json'

export const HOME_DESCRIPTION =
  'Think you know Gielinor? Host multiplayer quizzes for your clan or friends across 20+ game modes, or try the daily OSRS quiz.'

/** The How to play page's address; its views sit under it. */
export const HOW_TO_PATH = '/how-to-play'
export const EVENTS_SLUG = 'random-events'

/** Built modes that never appear as a public How to play page or showcase slide. */
export const NOT_SHOWN_MODES: ReadonlySet<string> = new Set([
  'custom',
  'random_event',
  'random_events_only',
])

/** A mode's part of the address, from its name, which reads better in a shared link than its id. */
export function slugOf(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export interface SeoMode {
  id: string
  label: string
  hint: string
  blurb: string
}

export interface SeoRoute {
  path: string
  title: string
  description: string
  sitemap: boolean
  noindex?: boolean
  /** Mode or view label for `BreadcrumbList` JSON-LD under `/how-to-play/*`. */
  breadcrumb?: string
}

export interface SeoManifest {
  site_name: string
  has_card: boolean
  routes: SeoRoute[]
}

export function homeTitle(siteName: string): string {
  return `${siteName} — OSRS Party Trivia Game`
}

export function pageTitle(label: string, siteName: string): string {
  return `${label} — ${siteName}`
}

export function joinDescription(siteName: string): string {
  return `Join an OSRS multiplayer trivia game at ${siteName}. Pick your display name and pet to enter the lobby.`
}

/** Static routes and every built mode's How to play page, in sitemap order. */
export function seoRoutes(siteName: string, modes: readonly SeoMode[]): SeoRoute[] {
  return [
    {
      path: '/',
      title: homeTitle(siteName),
      description: HOME_DESCRIPTION,
      sitemap: true,
    },
    {
      path: '/daily',
      title: pageTitle('Daily OSRS Quiz', siteName),
      description: `Play today's solo Old School RuneScape trivia challenge at ${siteName}. A fresh set of OSRS questions every day.`,
      sitemap: true,
    },
    {
      path: '/create',
      title: pageTitle('Create a Room', siteName),
      description: `Set up a custom OSRS multiplayer trivia lobby at ${siteName}. Pick game modes, configure teams or free-for-all, and invite your friends or clan.`,
      sitemap: true,
    },
    {
      path: HOW_TO_PATH,
      title: pageTitle('How to Play', siteName),
      description: `Learn how to host and play OSRS trivia at ${siteName}: 20+ game modes, eight question types, teams, TV sofa mode, Mystery Boxes, and random events.`,
      sitemap: true,
    },
    {
      path: `${HOW_TO_PATH}/${EVENTS_SLUG}`,
      title: pageTitle('Random Events', siteName),
      description: `Every now and then, an OSRS NPC drops in mid-round with a surprise question. Learn how random events work at ${siteName}.`,
      sitemap: true,
      breadcrumb: 'Random Events',
    },
    ...modes.map((mode) => ({
      path: `${HOW_TO_PATH}/${slugOf(mode.label)}`,
      title: pageTitle(mode.label, siteName),
      description: mode.blurb || mode.hint,
      sitemap: true,
      breadcrumb: mode.label,
    })),
    {
      path: '/suggest',
      title: pageTitle('Suggest a Question', siteName),
      description: `Submit your own Old School RuneScape trivia question to be added to ${siteName}.`,
      sitemap: false,
    },
    {
      path: '/report',
      title: pageTitle('Report a Question', siteName),
      description: `Report an issue or correction for an OSRS trivia question at ${siteName}.`,
      sitemap: false,
      noindex: true,
    },
  ]
}
