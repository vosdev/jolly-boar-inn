import type { PlayerView } from './protocol'

/**
 * Whether this browser shows a question's answers alone: the room has a TV connected to
 * show the rest, and this is not it. A TV that drops gives the phones the whole question
 * back until it returns, so a game never waits on a dead screen.
 */
export function answersOnly(players: PlayerView[], you: PlayerView | null): boolean {
  if (you?.role === 'tv') return false
  return players.some((player) => player.role === 'tv' && player.connected)
}
