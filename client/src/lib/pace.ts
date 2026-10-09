import type { Pace } from './protocol'

/** The create form's choices, slowest first, and how the lobby names the one picked. */
export const PACES: { value: Pace; label: string; note: string }[] = [
  { value: 'walk', label: 'Walk', note: 'Take your time for each question and the answer.' },
  { value: 'run', label: 'Run', note: 'The pace that this game was made for.' },
  { value: 'teleport', label: 'Teleport', note: 'For a room that knows its stuff.' },
]

export function paceLabel(pace: Pace): string {
  return PACES.find((option) => option.value === pace)?.label ?? pace
}
