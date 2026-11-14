/**
 * Where the bar, the footer and Home point. None of it is configurable: the AGPL wants a
 * way to the source from the running service, and a fork's links should still lead
 * upstream.
 */

export const REPO_URL = 'https://github.com/vosdev/jolly-boar-inn'
export const LICENSE_URL = `${REPO_URL}/blob/main/LICENSE`
export const RELEASES_URL = `${REPO_URL}/releases`
export const DISCORD_URL = 'https://discord.gg/FrWVe2dSGj'
export const WIKI_URL = 'https://oldschool.runescape.wiki'

/** Whether `link` is safe to open from a page: a stored link may be anything a player typed. */
export function isHttpsLink(link: string): boolean {
  try {
    return new URL(link).protocol === 'https:'
  } catch {
    return false
  }
}

/** `0.10.0` reads as `0.10`; a fix release keeps its patch number. */
export function versionLabel(version: string): string {
  return version.replace(/\.0$/, '')
}

export const VERSION_LABEL = versionLabel(__APP_VERSION__)
