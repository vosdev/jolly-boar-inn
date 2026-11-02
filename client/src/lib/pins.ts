/**
 * Where a `map_pin` question's pins stand against its targets, read off `question_closed`.
 *
 * `questions/types/map_pin.py` scores the same way. The server pairs pins with targets only to
 * add up credit and sends no pairing, so this repeats its search to draw each pin's line and
 * say how far off it was; `mapPins.fixture.json` holds both to the same answers. Where credit
 * ties, as it does for pins all out of reach, the shorter lines win: the server has no use for
 * that, and a line across the map to the wrong town would mislead.
 */

import { type MapBounds, type WorldPoint } from './map'
import type { PlayerResult } from './protocol'

/** A rectangle as the wire writes it. */
export interface WireBounds {
  min_x: number
  max_x: number
  min_y: number
  max_y: number
}

/** A box of tiles, both edges inside it. */
export interface PinTarget extends WireBounds {
  name: string
}

export interface PlacedPin {
  at: WorldPoint
  target: PinTarget
  /** Straight-line tiles outside the target's box; 0 inside it. */
  off: number
  /** The nearest tile of the box, where the pin's line goes. */
  to: WorldPoint
}

export interface PinRow {
  id: string
  pins: PlacedPin[]
  /** Mean tiles off: the pin's own, on a one-pin question. */
  off: number
  /** How many pins are inside their target. */
  inside: number
  points: number
}

const TIE = 1e-9

/** Above this many players who pinned, a several-pin map shows only your own. */
export const CROWD = 5

/** A rectangle off the wire. */
export function boundsOf(bounds: WireBounds): MapBounds {
  return { minX: bounds.min_x, maxX: bounds.max_x, minY: bounds.min_y, maxY: bounds.max_y }
}

/** The nearest tile of `target` to `pin`. */
export function nearestTile(pin: WorldPoint, target: PinTarget): WorldPoint {
  return {
    x: Math.min(Math.max(pin.x, target.min_x), target.max_x),
    y: Math.min(Math.max(pin.y, target.min_y), target.max_y),
  }
}

function tilesOff(pin: WorldPoint, target: PinTarget): number {
  const to = nearestTile(pin, target)
  return Math.hypot(pin.x - to.x, pin.y - to.y)
}

function pinCredit(pin: WorldPoint, target: PinTarget, reach: number): number {
  return Math.max(0, 1 - tilesOff(pin, target) / reach)
}

function orders(size: number): number[][] {
  if (size === 0) return [[]]
  return orders(size - 1).flatMap((order) =>
    Array.from({ length: size }, (_, at) => [...order.slice(0, at), size - 1, ...order.slice(at)]),
  )
}

function along(
  pins: readonly WorldPoint[],
  targets: readonly PinTarget[],
  order: readonly number[],
  measure: (pin: WorldPoint, target: PinTarget) => number,
): number {
  return order.reduce((total, index, position) => {
    const pin = pins[position]
    const target = targets[index]
    return pin === undefined || target === undefined ? total : total + measure(pin, target)
  }, 0)
}

/** Each pin's target index, in the assignment that earns the most credit. */
export function pairPins(
  pins: readonly WorldPoint[],
  targets: readonly PinTarget[],
  reach: number,
): number[] {
  let best: number[] = []
  let most = -1
  let least = Infinity
  for (const order of orders(targets.length)) {
    const credit = along(pins, targets, order, (pin, target) => pinCredit(pin, target, reach))
    const off = along(pins, targets, order, tilesOff)
    if (credit > most + TIE || (credit > most - TIE && off < least)) {
      best = order
      most = credit
      least = off
    }
  }
  return best
}

/** The credit those pins earn, which `grade` gives too. */
export function pairedCredit(
  pins: readonly WorldPoint[],
  targets: readonly PinTarget[],
  reach: number,
): number {
  const order = pairPins(pins, targets, reach)
  const sum = along(pins, targets, order, (pin, target) => pinCredit(pin, target, reach))
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
  reach: number,
): PlacedPin[] {
  return pairPins(pins, targets, reach).flatMap((index, position) => {
    const at = pins[position]
    const target = targets[index]
    if (at === undefined || target === undefined) return []
    return [{ at, target, off: tilesOff(at, target), to: nearestTile(at, target) }]
  })
}

/** Every player who pinned, nearest first. */
export function pinRows(
  results: Record<string, PlayerResult>,
  targets: readonly PinTarget[],
  reach: number,
): PinRow[] {
  return Object.entries(results)
    .map(([id, result]) => {
      const pins = placed(pinsOf(result.value), targets, reach)
      const off = pins.reduce((total, pin) => total + pin.off, 0) / Math.max(1, pins.length)
      const inside = pins.filter((pin) => pin.off === 0).length
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

function apart(a: WorldPoint, b: WorldPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/** The index in `pins` nearest `point`. */
export function nearestPin(pins: readonly WorldPoint[], point: WorldPoint): number {
  return pins.reduce((best, pin, index) => {
    const other = pins[best]
    return other !== undefined && apart(other, point) <= apart(pin, point) ? best : index
  }, 0)
}
