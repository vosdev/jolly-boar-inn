/**
 * Which side of its pet each pin's label goes on. Labels are dealt in the order given, so the
 * pins that matter most keep theirs; one with nowhere clear to go is left out. A label would
 * rather miss other pets, but covers one before it goes.
 */

export type Spot = 'below' | 'right' | 'left' | 'above'

export interface Box {
  left: number
  top: number
  right: number
  bottom: number
}

export interface PinLabel {
  id: string
  /** The pin's tip in the map's pixels. */
  x: number
  y: number
  width: number
  height: number
  /** The pet's width and height, which stands above the tip. */
  pet: number
}

const SPOTS: readonly Spot[] = ['below', 'right', 'left', 'above']
const GAP = 5

function boxAt(label: PinLabel, spot: Spot): Box {
  const { x, y, width, height, pet } = label
  switch (spot) {
    case 'below':
      return {
        left: x - width / 2,
        top: y + GAP,
        right: x + width / 2,
        bottom: y + GAP + height,
      }
    case 'above':
      return {
        left: x - width / 2,
        top: y - pet - GAP - height,
        right: x + width / 2,
        bottom: y - pet - GAP,
      }
    case 'right':
      return {
        left: x + pet / 2,
        top: y - pet / 2 - height / 2,
        right: x + pet / 2 + width,
        bottom: y - pet / 2 + height / 2,
      }
    case 'left':
      return {
        left: x - pet / 2 - width,
        top: y - pet / 2 - height / 2,
        right: x - pet / 2,
        bottom: y - pet / 2 + height / 2,
      }
  }
}

function hits(a: Box, b: Box): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
}

function inFrame(box: Box, frame: { width: number; height: number }): boolean {
  return box.left >= 0 && box.top >= 0 && box.right <= frame.width && box.bottom <= frame.height
}

/** Each label's spot, or null where it does not fit. */
export function placeLabels(
  labels: readonly PinLabel[],
  frame: { width: number; height: number },
): Map<string, Spot | null> {
  const pets = labels.map(({ id, x, y, pet }) => ({
    id,
    box: { left: x - pet / 2, top: y - pet, right: x + pet / 2, bottom: y },
  }))
  const taken: Box[] = []
  const spots = new Map<string, Spot | null>()
  for (const label of labels) {
    const others = pets.filter((other) => other.id !== label.id).map((other) => other.box)
    const clear = (blocked: readonly Box[]): Spot | undefined =>
      SPOTS.find((spot) => {
        const box = boxAt(label, spot)
        return inFrame(box, frame) && !blocked.some((other) => hits(box, other))
      })
    const spot = clear([...taken, ...others]) ?? clear(taken) ?? null
    spots.set(label.id, spot)
    if (spot !== null) taken.push(boxAt(label, spot))
  }
  return spots
}
