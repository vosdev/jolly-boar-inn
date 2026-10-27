/**
 * Who hosts Home and the lobby (section 14 of ideas/design.md): the selfhoster's hero, else
 * the Wise Old Man.
 */
import { hero, heroes, heroName, siteName } from 'virtual:branding'

/** The selfhoster's hero for `theme`, else theirs for every theme, else null. */
export function heroFor(theme: string): string | null {
  return heroes[theme] ?? hero
}

/** The name over the dialogue box for `art`: the hero's, else the site's, or the Wise Old Man's. */
export function speakerFor(art: string | null): string {
  if (art === null) return 'Wise Old Man'
  return heroName || siteName
}
