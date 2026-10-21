/**
 * Places that options are dragged into, and the tray they come from: what `ordering` and
 * `matching` share. A place holds a shown position or is empty; whatever no place holds
 * is in the tray, in its shown order. Each type says what a drop on a filled place does.
 */

/** The shown position at each place, or null while it is empty. */
export type Slots = (number | null)[]

/** `count` empty places. */
export function emptySlots(count: number): Slots {
  return Array.from({ length: count }, () => null)
}

/** The options in no place, in their shown order. */
export function trayOf(slots: Slots, options: number): number[] {
  return Array.from({ length: options }, (_, shown) => shown).filter(
    (shown) => !slots.includes(shown),
  )
}

/** `shown` back to the tray, leaving its place empty. */
export function toTray(slots: Slots, shown: number): Slots {
  return slots.map((at) => (at === shown ? null : at))
}

/**
 * `shown` put at place `at`, from another place or the tray. What held `at` takes the
 * place `shown` left, or goes back to the tray if it came from there.
 */
export function swapAt(slots: Slots, shown: number, at: number): Slots {
  const next = [...slots]
  const from = next.indexOf(shown)
  if (from === at) return next
  if (from !== -1) next[from] = next[at] ?? null
  next[at] = shown
  return next
}

/**
 * One keyboard step, up (-1) or down (1): past its neighbour, down from the last place
 * into the tray if there is one, or up from the tray into the last place by `drop`.
 */
export function stepped(
  slots: Slots,
  shown: number,
  by: -1 | 1,
  tray: boolean,
  drop: (slots: Slots, shown: number, at: number) => Slots,
): Slots {
  const from = slots.indexOf(shown)
  if (from === -1) return by === -1 ? drop(slots, shown, slots.length - 1) : slots
  const to = from + by
  if (to < 0) return slots
  if (to >= slots.length) return tray ? toTray(slots, shown) : slots
  const next = [...slots]
  next[from] = next[to] ?? null
  next[to] = shown
  return next
}

/** What to send when time runs out: empty places take the tray's options, top first. */
export function filled(slots: Slots, options: number): number[] {
  const rest = trayOf(slots, options)
  return slots.map((shown) => shown ?? (rest.shift() as number))
}
