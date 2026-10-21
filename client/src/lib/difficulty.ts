import type { Difficulty } from './protocol'

/** The create form's choices, easiest first, and how the lobby names the one picked. */
export const DIFFICULTIES: { value: Difficulty; label: string; note: string }[] = [
  { value: 'easy', label: 'Easy', note: 'Leaves out the hardest questions.' },
  { value: 'mixed', label: 'Mixed', note: 'Every question, easy to hard.' },
  { value: 'hard', label: 'Hard', note: 'Leaves out the easiest questions.' },
]

export function difficultyLabel(difficulty: Difficulty): string {
  return DIFFICULTIES.find((option) => option.value === difficulty)?.label ?? difficulty
}
