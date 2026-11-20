/**
 * Who a result's row is, for the views that draw players on a reveal. In a room a row is a
 * player at the table. On `/suggest`'s preview nobody sits at one, so its one row,
 * `PREVIEW_ID`, is you as your profile has you.
 */

import { petOf } from './pets'
import type { Profile } from './profile'
import type { PlayerView } from './protocol'

export const PREVIEW_ID = 'you'

/** Your row's id: your seat at the table, or the preview's without one. */
export function yourId(me: PlayerView | null): string {
  return me?.id ?? PREVIEW_ID
}

/** The pet a row stands as: its player's, yours from your profile on the preview, else none. */
export function petAt(
  id: string,
  room: readonly PlayerView[],
  me: PlayerView | null,
  profile: Profile | null,
): string {
  const player = room.find((one) => one.id === id)
  if (player !== undefined) return petOf(player)
  return id === yourId(me) && profile !== null ? profile.pet : ''
}
