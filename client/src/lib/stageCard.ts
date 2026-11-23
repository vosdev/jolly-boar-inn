/**
 * A picture's card of its own on a map stage, beside the sheet where there is room and under it
 * where there is not, so the sheet stays small (`PhotoStem`, `MinimapStem`).
 */

/**
 * Moves `card` from the sheet onto the map stage it stands on, if it stands on one, and keeps
 * `--below`, where the sheet ends, for a stage too narrow to set the card beside it. Tells
 * `onstage` once it has moved; the returned function takes it off again.
 */
export function toStage(card: HTMLElement, onstage: () => void): () => void {
  const stage = card.closest('.stage.map')
  const sheet = stage?.querySelector<HTMLElement>('.stage-row')
  if (!stage || !sheet) return () => {}
  stage.append(card)
  onstage()
  const place = () => card.style.setProperty('--below', `${sheet.offsetTop + sheet.offsetHeight}px`)
  place()
  const watch = new ResizeObserver(place)
  watch.observe(sheet)
  return () => {
    watch.disconnect()
    card.remove()
  }
}
