import type { Pace } from './protocol'

/** The create form's choices, slowest first, and how the lobby names the one picked. */
export const PACES: { value: Pace; label: string; note: string }[] = [
  { value: 'walk', label: 'Walk', note: 'Extra time for each question and the reveal.' },
  { value: 'run', label: 'Run', note: 'The standard pace the game is built around.' },
  { value: 'teleport', label: 'Teleport', note: 'Faster timers for players who know their stuff.' },
]

export function paceLabel(pace: Pace): string {
  return PACES.find((option) => option.value === pace)?.label ?? pace
}
