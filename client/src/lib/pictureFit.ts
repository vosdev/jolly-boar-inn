/** The least a Who's That NPC? picture is drawn at, in the room's px, however little room is left. */
export const PICTURE_LEAST = 160

/**
 * The height for a large question picture (section 10 of ideas/design.md): the `left` px of
 * the stage that is not the dialogue box, the sheet's padding or the answers, but no more than
 * the render's `natural` height, which it would only blur past, and no less than
 * `PICTURE_LEAST`, which wins over `left` but never over a render smaller than itself.
 */
export function pictureHeight(left: number, natural: number): number {
  return Math.round(Math.min(natural, Math.max(PICTURE_LEAST, left)))
}
