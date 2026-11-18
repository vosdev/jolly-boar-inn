/**
 * The items the lower half of the standings find in a Mystery Box (`rooms/items.py`), as a
 * player sees them: a name, the wiki's inventory icon and the line that says what it does.
 *
 * The server sends only an item's id and its charges, so everything a screen draws is here.
 * An item whose charges count down shows them in its name, and its icon follows the dose.
 */
import { derived } from 'svelte/store'

import { itemIcon } from './items'
import type { HeldItem, PlayerResult, PlayerView, SettledItem } from './protocol'
import { lastClosed, players, room } from './stores'

interface ItemInfo {
  name: string
  /** Drawn in small text where the icon file is missing. */
  short: string
  line: string
  /** The icon's wiki item id, by charges left where they count down. */
  icon: number | Readonly<Record<number, number>>
}

const ITEMS: Readonly<Record<string, ItemInfo>> = {
  super_restore: {
    name: 'Super restore',
    short: 'Restore',
    line: "Four doses. Each right answer on a speed question scores as if you'd answered quicker.",
    icon: { 4: 3024, 3: 3026, 2: 3028, 1: 3030 },
  },
  ring_of_life: {
    name: 'Ring of Life',
    short: 'Ring',
    line: 'Saves you once: your first answer worth under 500, even a wrong one, scores 500.',
    icon: 2570,
  },
  phoenix_necklace: {
    name: 'Phoenix necklace',
    short: 'Phoenix',
    line: 'Rises once: at the end of the round, your worst answer is replaced by the average of your others.',
    icon: 11090,
  },
}

/** The box itself, the wiki's Mystery box. */
export const MYSTERY_BOX_ICON = itemIcon('item:6199')

export const GONE_THIS_ROUND = 'Gone after this round'

/** The line under an item held for `round`, the next round's name on the standings. */
export function goneAfter(round: string | null): string {
  return round === null ? GONE_THIS_ROUND : `Gone after ${round}`
}

/** An item's name, its charges left in brackets where it has them: "Super restore (3)". */
export function itemName(id: string, charges: number | null = null): string {
  const name = ITEMS[id]?.name ?? id
  return charges === null ? name : `${name} (${charges})`
}

/** What the item does, in the words under it wherever it shows. */
export function itemLine(id: string): string {
  return ITEMS[id]?.line ?? ''
}

/** The item's name where its icon is missing. */
export function itemShort(id: string): string {
  return ITEMS[id]?.short ?? id
}

/** The icon's URL for an item with `charges` left (null: a full one), or null without a file. */
export function heldIcon(
  id: string,
  charges: number | null = null,
  files?: Record<string, string>,
): string | null {
  const icon = ITEMS[id]?.icon
  if (icon === undefined) return null
  const full = typeof icon === 'number' ? 0 : Math.max(...Object.keys(icon).map(Number))
  const wiki = typeof icon === 'number' ? icon : icon[charges ?? full]
  return wiki === undefined ? null : itemIcon(`item:${wiki}`, files)
}

/** One item that paid on the reveal: whose, which, as it was before paying, and how much. */
export interface ItemPoints {
  playerId: string
  item: string
  /** The charges it had before this close spent one; null for an item without charges. */
  charges: number | null
  points: number
}

function chargesBefore(item: string, now: HeldItem | null | undefined): number | null {
  if (typeof ITEMS[item]?.icon === 'number') return null
  return now?.id === item && now.charges !== null ? now.charges + 1 : 1
}

/**
 * Every item that paid on a close: an answer's `item_points`, or what a settle added on the
 * round's last close, which takes over the answer's own since it is the same item's points.
 */
export function itemPoints(
  results: Readonly<Record<string, PlayerResult>>,
  settled: Readonly<Record<string, SettledItem>>,
  held: readonly Pick<PlayerView, 'id' | 'item'>[],
): ItemPoints[] {
  const ids = new Set([...Object.keys(results), ...Object.keys(settled)])
  return [...ids].flatMap((playerId): ItemPoints[] => {
    const now = held.find((player) => player.id === playerId)?.item
    const late = settled[playerId]
    if (late !== undefined && late.points > 0) {
      return [
        { playerId, item: late.item, charges: chargesBefore(late.item, now), points: late.points },
      ]
    }
    const result = results[playerId]
    if (result === undefined || result.item === null || result.item_points <= 0) return []
    const item = result.item
    return [{ playerId, item, charges: chargesBefore(item, now), points: result.item_points }]
  })
}

/**
 * What each player is seen holding, by id. An item that broke on a close (`PlayerView.item`
 * null since) stays on through that close's reveal, so it leaves when the reveal ends.
 */
export const shownItems = derived([players, room, lastClosed], ([$players, $room, $closed]) => {
  const shown = new Map<string, HeldItem>()
  const revealing = $room?.phase === 'reveal' && $closed !== null
  const paid = revealing ? itemPoints($closed.results, $closed.settled ?? {}, $players) : []
  for (const player of $players) {
    if (player.item !== null) {
      shown.set(player.id, player.item)
      continue
    }
    const broke = paid.find((row) => row.playerId === player.id)
    if (broke !== undefined) shown.set(player.id, { id: broke.item, charges: broke.charges })
  }
  return shown
})
