/**
 * Where a `map_pin` question's pins stand against its targets, read off `question_closed`.
 *
 * `questions/types/map_pin.py` scores the same way. The server pairs pins with targets only to
 * add up credit and sends no pairing, so this repeats its search to draw each pin's line and
 * say how far off it was; `mapPins.fixture.json` holds both to the same answers.
 */

import type { MapBounds, WorldPoint } from './map'
import type { PlayerResult } from './protocol'

export interface PinTarget extends WorldPoint {
  name: string
  radius: number
}

export interface PlacedPin {
  at: WorldPoint
  target: PinTarget
  /** Straight-line tiles from the target's middle. */
  off: number
}

export interface PinRow {
  id: string
  pins: PlacedPin[]
  /** Mean tiles off: the pin's own, on a one-pin question. */
  off: number
  /** How many pins are inside their target's radius. */
  inside: number
  points: number
}

const WORLD_FALLOFF = 300
const REGION_FALLOFF_SHARE = 10

/** Above this many players who pinned, a several-pin map shows only your own. */
export const CROWD = 5

/** Tiles of `outside` a radius that cost a pin 63% of its credit. */
export function falloff(bounds?: MapBounds | null): number {
  if (bounds == null) return WORLD_FALLOFF
  const longer = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY)
  return Math.min(WORLD_FALLOFF, longer / REGION_FALLOFF_SHARE)
}

export function distance(a: WorldPoint, b: WorldPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function pinCredit(pin: WorldPoint, target: PinTarget, fall: number): number {
  const outside = distance(pin, target) - target.radius
  return outside <= 0 ? 1 : Math.exp(-outside / fall)
}

function orders(size: number): number[][] {
  if (size === 0) return [[]]
  return orders(size - 1).flatMap((order) =>
    Array.from({ length: size }, (_, at) => [...order.slice(0, at), size - 1, ...order.slice(at)]),
  )
}

/** Each pin's target index, in the assignment that earns the most credit. */
export function pairPins(
  pins: readonly WorldPoint[],
  targets: readonly PinTarget[],
  fall: number,
): number[] {
  const table = pins.map((pin) => targets.map((target) => pinCredit(pin, target, fall)))
  let best: number[] = []
  let most = -1
  for (const order of orders(targets.length)) {
    const sum = order.reduce((total, target, pin) => total + (table[pin]?.[target] ?? 0), 0)
    if (sum > most) {
      most = sum
      best = order
    }
  }
  return best
}

/** The credit those pins earn, which `grade` gives too. */
export function pairedCredit(
  pins: readonly WorldPoint[],
  targets: readonly PinTarget[],
  fall: number,
): number {
  const order = pairPins(pins, targets, fall)
  const sum = order.reduce((total, target, pin) => {
    const at = pins[pin]
    const to = targets[target]
    return at === undefined || to === undefined ? total : total + pinCredit(at, to, fall)
  }, 0)
  return sum / targets.length
}

function isTile(value: unknown): value is WorldPoint {
  const pin = value as WorldPoint | null
  return typeof pin?.x === 'number' && typeof pin.y === 'number'
}

/** A `value` as pins; empty for anything else. */
export function pinsOf(value: unknown): WorldPoint[] {
  return Array.isArray(value) ? value.filter(isTile) : []
}

/** One player's pins against the targets. */
export function placed(
  pins: readonly WorldPoint[],
  targets: readonly PinTarget[],
  fall: number,
): PlacedPin[] {
  return pairPins(pins, targets, fall).flatMap((index, pin) => {
    const at = pins[pin]
    const target = targets[index]
    return at === undefined || target === undefined
      ? []
      : [{ at, target, off: distance(at, target) }]
  })
}

/** Every player who pinned, nearest first. */
export function pinRows(
  results: Record<string, PlayerResult>,
  targets: readonly PinTarget[],
  fall: number,
): PinRow[] {
  return Object.entries(results)
    .map(([id, result]) => {
      const pins = placed(pinsOf(result.value), targets, fall)
      const off = pins.reduce((total, pin) => total + pin.off, 0) / Math.max(1, pins.length)
      const inside = pins.filter((pin) => pin.off <= pin.target.radius).length
      return { id, pins, off, inside, points: result.points }
    })
    .filter((row) => row.pins.length > 0)
    .sort((a, b) => a.off - b.off)
}

/** `pins` with the last one repeated up to `count`: what a question ending early sends. */
export function filledPins(pins: readonly WorldPoint[], count: number): WorldPoint[] {
  const last = pins[pins.length - 1]
  if (last === undefined) return []
  return [...pins, ...Array.from({ length: Math.max(0, count - pins.length) }, () => last)]
}

/** The index in `pins` nearest `point`. */
export function nearestPin(pins: readonly WorldPoint[], point: WorldPoint): number {
  return pins.reduce((best, pin, index) => {
    const other = pins[best]
    return other !== undefined && distance(other, point) <= distance(pin, point) ? best : index
  }, 0)
}
