/**
 * Where the bar, the footer and Home point. None of it is configurable: the AGPL wants a
 * way to the source from the running service, and a fork's links should still lead
 * upstream.
 */

export const REPO_URL = 'https://github.com/vosdev/jolly-boar-inn'
export const LICENSE_URL = `${REPO_URL}/blob/main/LICENSE`
/** CI tags every release `v<VERSION>`. */
export const RELEASE_URL = `${REPO_URL}/releases/tag/v${__APP_VERSION__}`
export const WIKI_URL = 'https://oldschool.runescape.wiki'

/** `0.10.0` reads as `0.10`; a fix release keeps its patch number. */
export const VERSION_LABEL = __APP_VERSION__.replace(/\.0$/, '')
