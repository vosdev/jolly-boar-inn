import { modeCopy } from './modes'

/** Example text for a form's question and explanation fields, per round. */
export interface FieldHints {
  prompt: string
  explanation: string
}

const FALLBACK: FieldHints = {
  prompt: 'e.g. Which skill do you train with a tinderbox?',
  explanation: 'Optional context shown on the reveal, e.g. why the answer is right.',
}

const HINTS: Record<string, FieldHints> = modeCopy('hints')

/** The hints for `mode`, or generic ones for a random event, a custom question or no round. */
export function fieldHints(mode: string): FieldHints {
  return HINTS[mode] ?? FALLBACK
}
