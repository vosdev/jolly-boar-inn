/** `/suggest`'s addresses, apart from `suggestions.ts` so the router loads none of the forms. */

export const SUGGEST_PATH = '/suggest'

/** The card slug in a `/suggest` address: null on the picker, undefined off `/suggest`. */
export function cardInPath(path: string): string | null | undefined {
  if (path === SUGGEST_PATH) return null
  if (!path.startsWith(`${SUGGEST_PATH}/`)) return undefined
  return path.slice(SUGGEST_PATH.length + 1) || null
}
