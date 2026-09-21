/** `heads-sprite.ts`: every chat head in `data/heads/`, as one sprite sheet. */
declare module 'virtual:heads' {
  /** The sheet: a hashed asset in a build, a data URL on the dev server. */
  export const sprite: string
  /** The side of one square cell, in the sheet's own pixels. */
  export const cell: number
  /** Cells per row; head `id` is at column `id % columns`, row `id / columns`. */
  export const columns: number
  /** Every head's name, in id order. Its length is the number of heads. */
  export const names: string[]
}
