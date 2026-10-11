/**
 * How long a game takes, as the minutes Create shows before the room exists. The lobby
 * reads the server's own count off the questions it stored (`RoomView.estimated_seconds`);
 * Create has no questions yet, so it multiplies each round by what its mode's pack
 * questions typically take (`ModePacing.seconds`). Both are ceilings: every question at
 * its full time, as `server/app/rooms/duration.py` counts them.
 */

/** `rooms/duration.py`'s `SPLASH_SECONDS`: a splash has no clock until the room is ready. */
export const SPLASH_SECONDS = 15

export interface PlannedRound {
  questions: number
  /** One question of the round, open and revealed. */
  seconds: number
}

/** The rounds, the events on top of them, a splash per round and standings between rounds. */
export function plannedSeconds(
  rounds: readonly PlannedRound[],
  events: number,
  eventSeconds: number,
  standings: number,
): number {
  const played = rounds.reduce((total, round) => total + round.questions * round.seconds, 0)
  const breaks = SPLASH_SECONDS * rounds.length + standings * Math.max(0, rounds.length - 1)
  return played + events * eventSeconds + breaks
}

/** `~12 min`, never under one. */
export function minutes(seconds: number): string {
  return `~${Math.max(1, Math.round(seconds / 60))} min`
}
