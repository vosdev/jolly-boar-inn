/**
 * Chat heads (D4, section 5.2 of ideas/design.md): which one a player wears, and a fresh
 * one for somebody re-rolling.
 *
 * A head is an id in `data/heads/heads.json`, and the id is the index into the manifest.
 * `players.avatar` stores it, so it travels to everybody else in the room — unlike the
 * theme, a head is for other people to see.
 *
 * `avatar ?? derived(id)` is the whole rule. Null is a player who never chose: every
 * player from before the column existed, and every player a pre-D4 client created. Those
 * are drawn the head their id hashes to, which every client in the room computes the same
 * way, so two browsers never disagree about a face. An id this build's manifest does not
 * have — a server whose manifest has grown since this client was built — falls back the
 * same way rather than drawing a gap.
 */

import { names } from 'virtual:heads'

/** How many heads this build has. The server holds its own copy of the same manifest. */
export const HEAD_COUNT = names.length

/** The head's name, for a screen reader: "Wizard", "Goblin". */
export function headName(head: number): string {
  return names[head] ?? 'Head'
}

/**
 * FNV-1a over the id's text, 32-bit. Not for security, for spread: uuids differ in their
 * random bits, and this turns any of them into an evenly spread head.
 */
function hash(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** The head a player who never chose one wears. Lowercased, since a uuid is either case. */
export function derivedHead(playerId: string): number {
  return hash(playerId.toLowerCase()) % HEAD_COUNT
}

function valid(head: number | null | undefined): head is number {
  return typeof head === 'number' && Number.isInteger(head) && head >= 0 && head < HEAD_COUNT
}

/** The head to draw for a player or a standing: their own, or the derived one. */
export function headOf(player: { id: string; avatar?: number | null }): number {
  return valid(player.avatar) ? player.avatar : derivedHead(player.id)
}

/** Whether `head` is one this build can draw, for a head read back from storage. */
export function isHead(head: unknown): head is number {
  return valid(head as number)
}

/**
 * A random head, other than `previous` and, when there is one left, other than every
 * head in `taken` — the faces already in the room, so a re-roll tends toward one nobody
 * else is wearing. A full room of fifty can still get fifty different heads this way;
 * past that, repeats are allowed rather than the button doing nothing.
 */
export function randomHead(taken: Iterable<number> = [], previous: number | null = null): number {
  const avoid = new Set(taken)
  if (previous !== null) avoid.add(previous)
  const free = [...Array(HEAD_COUNT).keys()].filter((head) => !avoid.has(head))
  const pool = free.length > 0 ? free : [...Array(HEAD_COUNT).keys()].filter((h) => h !== previous)
  return pool[Math.floor(Math.random() * pool.length)] ?? 0
}
