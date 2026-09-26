/** `site-branding.ts`: what a selfhoster calls the site, and how it looks by default. */
declare module 'virtual:branding' {
  /** `PUBLIC_SITE_NAME`, or The Jolly Boar Inn. */
  export const siteName: string
  /** The letter on the bundled sign. */
  export const initial: string
  /** `PUBLIC_SITE_LOGO` as a URL, or null for the bundled sign. */
  export const logo: string | null
  /** `PUBLIC_DEFAULT_THEME` unchecked, `''` when unset; `lib/theme.ts` checks it. */
  export const defaultTheme: string
}
