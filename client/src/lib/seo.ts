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
/** The OSRS trivia questions page's address, worded as people search for it. */
export const TRIVIA_PATH = '/osrs-trivia-questions'

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

import type { TriviaQuestion } from './triviaQuestions.ts'

export interface SeoMode {
  id: string
  label: string
  hint: string
  blurb: string
  host: { name: string }
}

/** A link in a page's crawlable copy. */
export interface SeoLink {
  path: string
  label: string
  note?: string
}

/**
 * What a page says before its script runs: the server writes it into the page for crawlers
 * and visitors without JavaScript, and the app replaces it when it mounts.
 */
export interface SeoCopy {
  heading: string
  paragraphs: string[]
  links: SeoLink[]
}

/** Words the pages show that live outside a mode's file, passed in by the build. */
export interface SeoExtras {
  ways: readonly { title: string; text: string }[]
  events: readonly { name: string; theme: string }[]
  questions: readonly TriviaQuestion[]
}

export function triviaIntro(siteName: string): string {
  return `Free OSRS trivia questions with answers, one from each game mode at ${siteName}. Use them for a clan quiz night, or create a room and play them live.`
}

/** A question as the served copy says it: what is asked, then the answer. */
function triviaParagraphs(question: TriviaQuestion): string[] {
  const asked = [
    `${question.label}: ${question.question}`,
    question.subject,
    question.quote === undefined ? undefined : `“${question.quote}”`,
    ...(question.clues ?? []),
    question.options === undefined ? undefined : `Options: ${question.options.join(', ')}.`,
  ].filter((line) => line !== undefined)
  const answer = [`Answer: ${question.answer}.`, question.detail].filter(Boolean).join(' ')
  return [asked.join(' '), answer]
}

export interface SeoRoute {
  path: string
  title: string
  description: string
  sitemap: boolean
  noindex?: boolean
  /** Mode or view label for `BreadcrumbList` JSON-LD under `/how-to-play/*`. */
  breadcrumb?: string
  copy?: SeoCopy
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

export const DAILY_INTRO = 'Ten questions, the same for everyone today. You only get one shot!'
export const EVENTS_INTRO =
  'When creating a room, the host chooses how often random events appear, and can even write custom questions for specific NPCs to ask.'
export const EVENTS_HINT = 'NPCs who drop in mid-round with a bonus question.'

const DAILY_LINK: SeoLink = { path: '/daily', label: 'Daily OSRS quiz' }
const CREATE_LINK: SeoLink = { path: '/create', label: 'Create a room' }
const HOW_TO_LINK: SeoLink = { path: HOW_TO_PATH, label: 'How to play' }
const ALL_MODES_LINK: SeoLink = { path: HOW_TO_PATH, label: 'All game modes' }

/** Static routes and every built mode's How to play page, in sitemap order. */
export function seoRoutes(
  siteName: string,
  modes: readonly SeoMode[],
  extras: SeoExtras = { ways: [], events: [], questions: [] },
): SeoRoute[] {
  const modeLinks = modes.map((mode) => ({
    path: `${HOW_TO_PATH}/${slugOf(mode.label)}`,
    label: mode.label,
    note: mode.hint,
  }))
  const eventsLink = {
    path: `${HOW_TO_PATH}/${EVENTS_SLUG}`,
    label: 'Random events',
    note: EVENTS_HINT,
  }
  return [
    {
      path: '/',
      title: homeTitle(siteName),
      description: HOME_DESCRIPTION,
      sitemap: true,
      copy: {
        heading: siteName,
        paragraphs: [HOME_DESCRIPTION],
        links: [DAILY_LINK, CREATE_LINK, HOW_TO_LINK],
      },
    },
    {
      path: '/daily',
      title: pageTitle('Daily OSRS Quiz', siteName),
      description: `Play today's solo Old School RuneScape trivia challenge at ${siteName}. A fresh set of OSRS questions every day.`,
      sitemap: true,
      copy: { heading: 'Daily', paragraphs: [DAILY_INTRO], links: [HOW_TO_LINK, CREATE_LINK] },
    },
    {
      path: '/create',
      title: pageTitle('Create a Room', siteName),
      description: `Set up a custom OSRS multiplayer trivia lobby at ${siteName}. Pick game modes, configure teams or free-for-all, and invite your friends or clan.`,
      sitemap: true,
      copy: {
        heading: 'Create a room',
        paragraphs: [
          `Set up a custom OSRS multiplayer trivia lobby at ${siteName}. Pick game modes, configure teams or free-for-all, and invite your friends or clan.`,
        ],
        links: [HOW_TO_LINK, DAILY_LINK],
      },
    },
    {
      path: HOW_TO_PATH,
      title: pageTitle('How to Play', siteName),
      description: `Learn how to host and play OSRS trivia at ${siteName}: 20+ game modes, eight question types, teams, TV sofa mode, Mystery Boxes, and random events.`,
      sitemap: true,
      copy: {
        heading: 'How to play',
        paragraphs: extras.ways.map((way) => `${way.title}: ${way.text}`),
        links: [...modeLinks, eventsLink],
      },
    },
    {
      path: `${HOW_TO_PATH}/${EVENTS_SLUG}`,
      title: pageTitle('Random Events', siteName),
      description: `Every now and then, an OSRS NPC drops in mid-round with a surprise question. Learn how random events work at ${siteName}.`,
      sitemap: true,
      breadcrumb: 'Random Events',
      copy: {
        heading: 'Random events',
        paragraphs: [EVENTS_INTRO, ...extras.events.map((npc) => `${npc.name}: ${npc.theme}`)],
        links: [ALL_MODES_LINK, CREATE_LINK],
      },
    },
    ...modes.map((mode) => ({
      path: `${HOW_TO_PATH}/${slugOf(mode.label)}`,
      title: pageTitle(mode.label, siteName),
      description: mode.blurb || mode.hint,
      sitemap: true,
      breadcrumb: mode.label,
      copy: {
        heading: mode.label,
        paragraphs: [`Hosted by ${mode.host.name}`, mode.hint, ...(mode.blurb ? [mode.blurb] : [])],
        links: [ALL_MODES_LINK, CREATE_LINK],
      },
    })),
    {
      path: TRIVIA_PATH,
      title: pageTitle('OSRS Trivia Questions and Answers', siteName),
      description: `Free Old School RuneScape trivia questions with answers, one from each game mode at ${siteName}. Ready for a clan quiz night.`,
      sitemap: true,
      copy: {
        heading: 'OSRS trivia questions',
        paragraphs: [triviaIntro(siteName), ...extras.questions.flatMap(triviaParagraphs)],
        links: [
          ...extras.questions.map((question) => ({ path: question.path, label: question.label })),
          CREATE_LINK,
        ],
      },
    },
    {
      path: '/suggest',
      title: pageTitle('Suggest a Question', siteName),
      description: `Submit your own Old School RuneScape trivia question to be added to ${siteName}.`,
      sitemap: false,
      copy: {
        heading: 'Suggest a question',
        paragraphs: [
          `Submit your own Old School RuneScape trivia question to be added to ${siteName}.`,
        ],
        links: [HOW_TO_LINK],
      },
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
