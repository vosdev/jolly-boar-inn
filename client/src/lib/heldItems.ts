/**
 * The items the lower half of the standings find in a Mystery Box (`rooms/items.py`), as a
 * player sees them: a name, the wiki's inventory icon and the line that says what it does.
 *
 * The server sends only an item's id and its charges, so everything a screen draws is here.
 * An item whose charges count down shows them in its name, and its icon follows the dose.
 */
import { derived } from 'svelte/store'

import { itemIcon } from './items'
import type { HeldItem, OpenQuestion, PlayerResult, PlayerView, SettledItem } from './protocol'
import { lastClosed, players, room } from './stores'

/** How a player uses an item on an open question (`rooms/items.py`'s `Use`). */
interface ItemUse {
  button: string
  /** In the item's line's place once used, until the reveal ends. */
  after: string
  /** Refused once you have answered the question. */
  beforeAnswer: boolean
  /** Question types it does nothing on. */
  refusedOn?: readonly string[]
}

interface ItemInfo {
  name: string
  /** Drawn in small text where the icon file is missing. */
  short: string
  line: string
  /** The icon's wiki item id, by charges left where they count down. */
  icon: number | Readonly<Record<number, number>>
  use?: ItemUse
}

/** The item that answers for you, whose points are the answer's own. */
export const BOOK = 'book_of_knowledge'

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
  kebab: {
    name: 'Kebab',
    short: 'Kebab',
    line: 'Eat it while a question is open: +300.',
    icon: 1971,
    use: { button: 'Eat it', after: 'Eaten: +300 on this question.', beforeAnswer: false },
  },
  ring_of_charos: {
    name: 'Ring of Charos (a)',
    short: 'Charos',
    line: 'Charm the host before you answer: this question pays double. A wrong answer pays nothing.',
    icon: 6465,
    use: {
      button: 'Charm the host',
      after: 'Charmed: this question pays you double.',
      beforeAnswer: true,
      refusedOn: ['more_less'],
    },
  },
  [BOOK]: {
    name: 'Book of Knowledge',
    short: 'Book',
    line: 'Open it on a question and it answers for you, right, as fast as you opened it.',
    icon: 11640,
    use: {
      button: 'Open the book',
      after: "The book answered for you. You'll see how on the reveal.",
      beforeAnswer: true,
    },
  },
  xp_lamp: {
    name: 'XP lamp',
    short: 'Lamp',
    line: 'Rub it before you answer: this question pays double.',
    icon: 2528,
    use: {
      button: 'Rub it',
      after: 'Lamp rubbed: this question pays you double.',
      beforeAnswer: true,
      refusedOn: ['more_less'],
    },
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

/** The button that uses the item, or null for one that works by itself. */
export function useButton(id: string): string | null {
  return ITEMS[id]?.use?.button ?? null
}

/** The line in the item's place once it was used on this question. */
export function afterUse(id: string): string {
  return ITEMS[id]?.use?.after ?? ''
}

/**
 * Whether `held` can be used on `question` now: an item you use, a question you may answer
 * that takes answers, not used on it yet, and not answered if the item wants it before.
 * The server refuses the same.
 */
export function canUse(
  held: HeldItem | null,
  question: OpenQuestion | null,
  answered: boolean,
  used: boolean,
): boolean {
  const use = held === null ? undefined : ITEMS[held.id]?.use
  if (use === undefined || question === null || used || !question.you_can_answer) return false
  if (use.beforeAnswer && answered) return false
  return !(use.refusedOn ?? []).includes(question.type)
}

const numbers = new Intl.NumberFormat('en-GB')

/** Points with their sign, a true minus for a ring that took them back: "+300", "−540". */
export function signed(points: number): string {
  return `${points < 0 ? '\u2212' : '+'}${numbers.format(Math.abs(points))}`
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
  /** Below 0 for a charmed answer that was not right. */
  points: number
  /** The Book of Knowledge's answer: `points` are the answer's own, already on its chip. */
  byBook?: boolean
}

function chargesBefore(item: string, now: HeldItem | null | undefined): number | null {
  if (typeof ITEMS[item]?.icon === 'number') return null
  return now?.id === item && now.charges !== null ? now.charges + 1 : 1
}

/**
 * Every item that paid on a close: an answer's `item_points`, what a settle added on the
 * round's last close, which takes over the answer's own since it is the same item's points,
 * or the Book of Knowledge's answer with that answer's points.
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
    if (result?.by_book === true) {
      return [{ playerId, item: BOOK, charges: null, points: result.points, byBook: true }]
    }
    if (result === undefined || result.item === null || result.item_points === 0) return []
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
