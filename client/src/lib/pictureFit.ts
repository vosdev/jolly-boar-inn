/** The least a Who's That NPC? picture is drawn at, in the room's px, however little room is left. */
export const PICTURE_LEAST = 160

/** The suggestions the stage keeps room for under the answer input. */
export const SUGGESTIONS = 5

/** The height of one suggestion, in rem; `PickFromList` holds its rows to it. */
export const SUGGESTION_ROW_REM = 2.5

/**
 * The height for a large question picture (section 10 of ideas/design.md): the `left` px of
 * the stage that is not the dialogue box, the sheet's padding or the answers, but no more
 * than the render's `natural` height as the player sees it, which it would only blur past,
 * and no less than `PICTURE_LEAST`, which wins over `left` but never over a render smaller
 * than itself. The room is drawn `scale` times its own px, so one image pixel per screen px
 * is `natural / scale` of them.
 */
export function pictureHeight(left: number, natural: number, scale = 1): number {
  return Math.round(Math.min(natural / scale, Math.max(PICTURE_LEAST, left)))
}

/** The room's px a floating list of `SUGGESTIONS` rows takes under its input, at `rem` px to the rem. */
export function suggestionsHeight(rem: number): number {
  // The list's padding, its gap under the input and a border of any theme.
  return Math.ceil(rem * (SUGGESTIONS * SUGGESTION_ROW_REM + 0.85) + 8)
}
