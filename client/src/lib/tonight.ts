/**
 * The splash's row of tonight's rounds (section 9 of ideas/design.md): one stop per round,
 * the current one named. A round's host shows only where this client can know it: the
 * current round and the ones played (`room.played`) always; every round when the host listed
 * them in order and did not hide them, since then `settings.modes` is the running order.
 * Shuffled or hidden rounds still to come are the game's to reveal, so they stay blanks.
 */

import type { ModeSettings } from './protocol'

export interface Stop {
  /** 0-based round. */
  index: number
  /** The host's NPC id, or null where it is not this client's to know. */
  mode: string | null
  state: 'done' | 'now' | 'next'
}

export interface Tonight {
  stops: Stop[]
  /** Rounds outside the window, before and after it. */
  before: number
  after: number
}

export interface Night {
  /** The current round, 0-based, and how many there are. */
  index: number
  total: number
  /** The current round's mode. */
  mode: string
  /** The modes of the rounds before it, in order: `room.played`. */
  played?: string[]
  modes?: ModeSettings[]
  modeOrder?: 'listed' | 'random'
  hidden?: boolean
}

/** The stops of `night` that fit `size`, the current one as near the middle as the ends allow. */
export function tonight(night: Night, size: number): Tonight {
  const { index, total } = night
  const known =
    night.modeOrder === 'listed' && night.hidden !== true && night.modes?.length === total
  const start = Math.max(0, Math.min(index - Math.floor((size - 1) / 2), total - size))
  const end = Math.min(total, start + size)
  const stops: Stop[] = []
  for (let at = start; at < end; at++) {
    stops.push({
      index: at,
      mode: modeAt(night, at, known),
      state: at < index ? 'done' : at === index ? 'now' : 'next',
    })
  }
  return { stops, before: start, after: total - end }
}

function modeAt(night: Night, at: number, known: boolean): string | null {
  if (at === night.index) return night.mode
  if (at < night.index && night.played?.[at] !== undefined) return night.played[at]
  return known ? (night.modes?.[at]?.mode ?? null) : null
}
