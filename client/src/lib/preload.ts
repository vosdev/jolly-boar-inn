/**
 * The pictures a player is likely to see on their next screen, fetched once the first one
 * is up so a screen change does not draw them in mid-fade: every NPC and hero, the theme
 * emblems, the team logos and the pets' chatheads. Items, pet icons, stickers and the like
 * are left out on purpose: there are too many, and a new folder of large art (maps) joins
 * this list only if a screen needs it at first sight.
 */

const IMPORTANT: Record<string, string>[] = [
  import.meta.glob<string>('../assets/npcs/*.{avif,webp,png,jpg,jpeg,svg}', {
    eager: true,
    query: '?url',
    import: 'default',
  }),
  import.meta.glob<string>('../assets/themes/*.{avif,webp,png,jpg,jpeg,svg}', {
    eager: true,
    query: '?url',
    import: 'default',
  }),
  import.meta.glob<string>('../assets/teams/*.{avif,webp,png,jpg,jpeg,svg}', {
    eager: true,
    query: '?url',
    import: 'default',
  }),
  import.meta.glob<string>('../assets/pets/*_chathead.{avif,webp,png,jpg,jpeg,svg}', {
    eager: true,
    query: '?url',
    import: 'default',
  }),
]

interface Connection {
  saveData?: boolean
  effectiveType?: string
}

/** Whether the connection asked to be spared: data saver, or 2G. */
function frugal(): boolean {
  const connection = (navigator as Navigator & { connection?: Connection }).connection
  return connection?.saveData === true || /(^|-)2g$/.test(connection?.effectiveType ?? '')
}

/** Every URL on the list, once each. */
export function importantPictures(): string[] {
  return [...new Set(IMPORTANT.flatMap((files) => Object.values(files)))]
}

/** Fetch the list when the browser has nothing else to do; a frugal connection fetches none. */
export function preloadPictures(
  urlList: string[] = importantPictures(),
  idle: (run: () => void) => void = whenIdle,
): void {
  if (frugal()) return
  idle(() => {
    for (const url of urlList) {
      const image = new Image()
      image.decoding = 'async'
      image.src = url
    }
  })
}

function whenIdle(run: () => void): void {
  if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 5000 })
  else setTimeout(run, 2000)
}
