/** `site-branding.ts`: what a selfhoster calls the site, and how it looks by default. */
declare module 'virtual:branding' {
  /** `PUBLIC_SITE_NAME`, or The Jolly Boar Inn. */
  export const siteName: string
  /** The letter on the bundled sign. */
  export const initial: string
  /** `PUBLIC_SITE_LOGO` as a URL, or null for the bundled sign. */
  export const logo: string | null
  /** The logos beside it named for a theme (`logo-tzhaar.svg`), as URLs by theme. */
  export const logos: Record<string, string>
  /** `hero` beside the logo as a URL: who stands on Home's stage, or null for the Wise Old Man. */
  export const hero: string | null
  /** The heroes beside it named for a theme, as URLs by theme. */
  export const heroes: Record<string, string>
  /** Every theme's tab icon. */
  export const favicons: Record<string, { href: string; type: string }>
  /** `PUBLIC_DEFAULT_THEME` unchecked, `''` when unset; `lib/theme.ts` checks it. */
  export const defaultTheme: string
}
