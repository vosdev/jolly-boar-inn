import { writable } from 'svelte/store'

import { modeLabel } from './modes'
import type { RoomStatus, Segment } from './protocol'

/** What the top bar's middle says about where the night is: a lead, then the mode. */
export interface BarWhere {
  lead: string
  mode: string | null
}

/** Set by the room, drawn by the top bar; null says nothing. */
export const barWhere = writable<BarWhere | null>(null)

/** Where a room in `status` and `phase`, in round `segment`, is in its night. */
export function whereOf(
  status: RoomStatus,
  phase: string | null,
  segment: Segment | null,
): BarWhere | null {
  if (status === 'lobby') return { lead: 'Lobby', mode: null }
  if (status === 'finished') return { lead: 'Final hiscores', mode: null }
  if (segment === null) return null
  const round = `round ${segment.index + 1} of ${segment.total}`
  if (phase === 'standings') return { lead: `Hiscores after ${round}`, mode: null }
  return { lead: `Round ${segment.index + 1} of ${segment.total}:`, mode: modeLabel(segment.mode) }
}
