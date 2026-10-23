/**
 * On a phone and on the room's TV the sheet's words wrap around whoever stands on it
 * (sections 8 and 16 of ideas/design.md): the host at the sheet's bottom-left, an event's
 * NPC at its bottom-right.
 *
 * The words are a flex column, each line its own box, so no one float could make them
 * flow around the NPC. Each box that reaches down beside it gets a float of its own
 * instead, as tall as the box down to the NPC's feet, whose shape starts at the NPC's head
 * (`shape-outside`), so the lines above still run the sheet's full width. A row, such as
 * the sheet's foot, or a control steps aside whole; a column is walked into, so each of
 * its lines wraps on its own. `StageView` draws the floats from what this marks.
 */

export type Side = 'left' | 'right'

/**
 * A box in the page's pixels, as `getBoundingClientRect` gives it. The TV scales its whole
 * stage, so what is measured in the page's pixels is written in the stage's own, divided
 * by that scale.
 */
export interface Box {
  top: number
  right: number
  bottom: number
  left: number
}

/** How far the words keep from the NPC's side and above its head, in px. */
const GAP = 10
const LIFT = 4

/** Fitting can grow a box into the seat, which then needs fitting again; it settles in two. */
const PASSES = 4

const WRAPS = new Set(['block', 'flow-root', 'list-item'])
const OWN_LAYOUT = new Set(['flex', 'grid', 'table', 'flow-root'])
const CONTROLS = new Set(['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'IMG', 'svg'])

/** The space the NPC takes on the sheet, with the words' clearance around it. */
export function seatOf(npc: Box, side: Side): Box {
  // Spelled out: a DOMRect's sides are getters, which a spread would not copy.
  return {
    top: npc.top - LIFT,
    bottom: npc.bottom,
    left: side === 'left' ? npc.left : npc.left - GAP,
    right: side === 'left' ? npc.right + GAP : npc.right,
  }
}

/**
 * Mark each box in `content` that reaches beside `seat` to wrap or step aside, and unmark
 * the rest; null unmarks all. Whether anything changed, so the caller fits again.
 */
export function seatWords(content: HTMLElement, seat: Box | null, side: Side): boolean {
  const kept = new Set<HTMLElement>()
  let changed = false
  if (seat !== null) {
    const edge = content.getBoundingClientRect()
    const scale = content.offsetWidth > 0 ? (edge.right - edge.left) / content.offsetWidth : 1
    const width = (side === 'left' ? seat.right - edge.left : edge.right - seat.left) / scale
    if (width > 0) {
      for (const child of content.children) {
        changed = place(child as HTMLElement, seat, side, Math.ceil(width), kept, scale) || changed
      }
    }
  }
  for (const el of content.querySelectorAll<HTMLElement>('[data-seat]')) {
    if (kept.has(el)) continue
    delete el.dataset.seat
    for (const name of ['--seat-w', '--seat-h', '--seat-from']) el.style.removeProperty(name)
    changed = true
  }
  return changed
}

function place(
  el: HTMLElement,
  seat: Box,
  side: Side,
  width: number,
  kept: Set<HTMLElement>,
  scale: number,
): boolean {
  const style = getComputedStyle(el)
  if (style.display === 'contents') return placeAll(el, seat, side, width, kept, scale)
  const box = el.getBoundingClientRect()
  if (box.height === 0 || box.bottom <= seat.top || box.top >= seat.bottom) return false
  if (columnOf(el, style)) return placeAll(el, seat, side, width, kept, scale)
  kept.add(el)
  if (CONTROLS.has(el.tagName) || !WRAPS.has(style.display)) {
    return mark(el, `shift-${side}`, { '--seat-w': width })
  }
  // The float sits in the box's content, from its top: as wide as the seat reaches into it,
  // as tall as the content goes beside the seat, and solid only from the seat's top down.
  // Measured from the border, a padded box would grow by its padding at every fit.
  const inner = innerOf(box, style, scale)
  const reach = (side === 'left' ? seat.right - inner.left : inner.right - seat.left) / scale
  return mark(el, `wrap-${side}`, {
    '--seat-w': Math.max(0, Math.ceil(reach)),
    '--seat-h': Math.max(0, Math.floor((Math.min(inner.bottom, seat.bottom) - inner.top) / scale)),
    '--seat-from': Math.max(0, Math.floor((seat.top - inner.top) / scale)),
  })
}

/** A box's content box: inside its border and padding, which are in the stage's pixels. */
function innerOf(box: Box, style: CSSStyleDeclaration, scale: number): Box {
  const px = (value: string): number => (parseFloat(value) || 0) * scale
  return {
    top: box.top + px(style.borderTopWidth) + px(style.paddingTop),
    bottom: box.bottom - px(style.borderBottomWidth) - px(style.paddingBottom),
    left: box.left + px(style.borderLeftWidth) + px(style.paddingLeft),
    right: box.right - px(style.borderRightWidth) - px(style.paddingRight),
  }
}

function placeAll(
  el: HTMLElement,
  seat: Box,
  side: Side,
  width: number,
  kept: Set<HTMLElement>,
  scale: number,
): boolean {
  let changed = false
  for (const child of el.children) {
    changed = place(child as HTMLElement, seat, side, width, kept, scale) || changed
  }
  return changed
}

/**
 * Whether a box's lines live in boxes of their own: a flex column, or a block holding a
 * box with its own layout, which would keep clear of the whole float rather than its shape.
 */
function columnOf(el: HTMLElement, style: CSSStyleDeclaration): boolean {
  if (style.display === 'flex') return style.flexDirection.startsWith('column')
  if (!WRAPS.has(style.display) || CONTROLS.has(el.tagName)) return false
  return [...el.children].some((child) => OWN_LAYOUT.has(getComputedStyle(child).display))
}

function mark(el: HTMLElement, how: string, sizes: Record<string, number>): boolean {
  let changed = el.dataset.seat !== how
  if (changed) el.dataset.seat = how
  for (const [name, px] of Object.entries(sizes)) {
    if (el.style.getPropertyValue(name) === `${px}px`) continue
    el.style.setProperty(name, `${px}px`)
    changed = true
  }
  return changed
}

/** The screens where the sheet runs edge to edge and its NPC stands on it. */
const PHONE = '(max-width: 447.98px)'

/**
 * Keep `content`'s words wrapped around `npc` on a phone, or wherever `onSheet` says the
 * NPC stands on the sheet, as either changes size or the words change, a frame later.
 * Returns the stop, which unmarks everything.
 */
export function keepSeated(
  content: HTMLElement,
  npc: HTMLElement,
  side: Side,
  onSheet: () => boolean = () => false,
): () => void {
  let frame = 0
  // Crossing into or out of a phone's width resizes the sheet, so no media listener is needed.
  const fit = (): void => {
    frame = 0
    for (let i = 0; i < PASSES; i++) {
      const seated = onSheet() || matchMedia(PHONE).matches
      const seat = seated ? seatOf(npc.getBoundingClientRect(), side) : null
      if (!seatWords(content, seat, side)) break
    }
  }
  const later = (): void => {
    if (frame === 0) frame = requestAnimationFrame(fit)
  }
  const resized = new ResizeObserver(later)
  resized.observe(content)
  resized.observe(npc)
  const rewritten = new MutationObserver(later)
  rewritten.observe(content, { childList: true, subtree: true })
  later()
  return () => {
    cancelAnimationFrame(frame)
    resized.disconnect()
    rewritten.disconnect()
    seatWords(content, null, side)
  }
}
