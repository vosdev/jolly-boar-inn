/**
 * How many rooms a host keeps at once. The server's hourly create limit is the backstop
 * for a script; this is the polite limit for a person, and clearing storage bypasses it.
 */

import { ApiFailure, getRoom } from './api'
import { createdRooms, forgetCreated } from './session'

export const MAX_ROOMS = 5

/**
 * Whether this browser already hosts `MAX_ROOMS` rooms the server still has.
 *
 * The list is only checked against the server once it is full, so a host under the limit
 * costs no requests. A room removed from another device answers 404 and one past its
 * expiry 410, and either comes off the list rather than counting. Any other failure
 * counts the room, since nothing says it is gone.
 */
export async function atRoomLimit(): Promise<boolean> {
  const rooms = createdRooms()
  if (rooms.length < MAX_ROOMS) return false
  const live = await Promise.all(rooms.map(stillThere))
  return live.filter(Boolean).length >= MAX_ROOMS
}

async function stillThere(code: string): Promise<boolean> {
  try {
    await getRoom(code)
  } catch (failure) {
    if (failure instanceof ApiFailure && (failure.status === 404 || failure.status === 410)) {
      forgetCreated(code)
      return false
    }
  }
  return true
}
