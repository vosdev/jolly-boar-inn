/**
 * A picture's card of its own on a map stage, beside the sheet where there is room and under it
 * where there is not, so the sheet stays small (`PhotoStem`, `MinimapStem`).
 */

/**
 * Moves `card` from the sheet onto the map stage it stands on, and keeps `--below`, where the
 * sheet ends, for a stage too narrow to set the card beside it. A stem is drawn before its stage
 * turns into a map, and sometimes before it is on the stage at all, so both are waited for. Tells `onstage` once it has moved; the returned function takes it off.
 */
export function toStage(card: HTMLElement, onstage: () => void): () => void {
  let undo = () => {}
  const move = (stage: Element): boolean => {
    const sheet = stage.querySelector<HTMLElement>('.stage-row')
    if (!stage.classList.contains('map') || sheet === null) return false
    stage.append(card)
    onstage()
    const place = () =>
      card.style.setProperty('--below', `${sheet.offsetTop + sheet.offsetHeight}px`)
    place()
    const watch = new ResizeObserver(place)
    watch.observe(sheet)
    undo = () => {
      watch.disconnect()
      card.remove()
    }
    return true
  }
  let frame = 0
  let wait: MutationObserver | null = null
  // The scroll may draw a stem elsewhere and carry it onto the stage a frame later.
  const find = () => {
    const stage = card.closest('.stage')
    if (stage === null) {
      frame = requestAnimationFrame(find)
      return
    }
    if (move(stage)) return
    wait = new MutationObserver(() => {
      if (move(stage)) wait?.disconnect()
    })
    wait.observe(stage, { attributes: true, attributeFilter: ['class'] })
  }
  find()
  return () => {
    cancelAnimationFrame(frame)
    wait?.disconnect()
    undo()
  }
}
