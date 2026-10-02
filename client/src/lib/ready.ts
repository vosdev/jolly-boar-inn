/**
 * The ready check's threshold, the same rule as `server/app/rooms/ready.py`.
 *
 * The server is what acts on it — a splash's countdown starts there — so this copy only
 * decides what the screens say: whether the lobby's Start is the plain button or the
 * host's "start anyway", and how many more taps a splash is waiting on.
 *
 * `min(ceil(0.8 × eligible), eligible - 1)`, with a room of one at 1: a cap, so two of
 * three is enough, and a player alone still taps.
 */
export function readyThreshold(eligible: number): number {
  if (eligible <= 1) return 1
  return Math.min(Math.ceil(0.8 * eligible), eligible - 1)
}
