/**
 * How to play's Try a question: one sample question per mode, played on the page alone.
 *
 * Written here rather than drawn from a pack, so trying one never spoils a real question
 * and never reaches the server: nothing is sent, so nothing lands in anyone's stats. Each
 * sample is the `client_view` its type sends while open, plus the shown answer's index,
 * which is all the one-answer types need to draw their reveal and grade.
 *
 * Only the types whose grading is "the right index or not" have samples; a mode whose
 * round asks only in other types has none, and its view offers no Try a question.
 */

import type { PlayerResult } from './protocol'

/** How long a sample stays open, in seconds: the room's usual question. */
export const SAMPLE_SECONDS = 20

export interface Sample {
  mode: string
  type: 'more_less' | 'multiple_choice'
  /** `client_view(payload)`: what the question shows while open. */
  view: Record<string, unknown>
  /** The right answer's shown position. */
  answer: number
  /** More or Less's reveal: each option's value, in the shown order. */
  values?: number[]
}

export const SAMPLES: Record<string, Sample> = {
  more_less: {
    mode: 'more_less',
    type: 'more_less',
    view: {
      metric: 'high_alch',
      direction: 'more',
      options: [
        { subject: { name: 'Rune scimitar', asset: 'item:1333' } },
        { subject: { name: 'Rune platebody', asset: 'item:1127' } },
      ],
      as_of: '2026-10-01',
    },
    answer: 1,
    values: [15360, 39000],
  },
  guess_examine: {
    mode: 'guess_examine',
    type: 'multiple_choice',
    view: {
      prompt: 'A razor-sharp ring of obsidian.',
      options: ['Toktz-xil-ak', 'Toktz-xil-ul', 'Tzhaar-ket-om', 'Obsidian cape'],
    },
    answer: 1,
  },
  who_said_that: {
    mode: 'who_said_that',
    type: 'multiple_choice',
    view: {
      quote: 'What am I to do?',
      options: ['The Cook', 'Duke Horacio', 'Father Aereck', 'Hans'],
    },
    answer: 0,
  },
  know_your_content_creator: {
    mode: 'know_your_content_creator',
    type: 'multiple_choice',
    view: {
      prompt: 'Which game company makes Old School RuneScape?',
      options: ['Blizzard', 'Jagex', 'Valve', 'Bethesda'],
    },
    answer: 1,
  },
  bestiary: {
    mode: 'bestiary',
    type: 'multiple_choice',
    view: {
      prompt: 'How many hitpoints does a Hill Giant have?',
      options: ['25', '35', '45', '60'],
    },
    answer: 1,
  },
  drop_table: {
    mode: 'drop_table',
    type: 'multiple_choice',
    view: {
      prompt: 'Which monster drops the Abyssal whip?',
      options: ['Greater demon', 'Abyssal demon', 'Black dragon', 'Gargoyle'],
    },
    answer: 1,
  },
  odd_one_out: {
    mode: 'odd_one_out',
    type: 'multiple_choice',
    view: {
      prompt: 'Which one is not a Barrows brother?',
      options: ['Dharok', 'Karil', 'Hazeel', 'Verac'],
    },
    answer: 2,
  },
  minigame_madness: {
    mode: 'minigame_madness',
    type: 'multiple_choice',
    view: {
      prompt: 'Which minigame rewards the Fire cape?',
      options: ['Pest Control', 'The Fight Caves', 'Barbarian Assault', 'Castle Wars'],
    },
    answer: 1,
  },
}

/** What the type's reveal sends: the open view with the answer's shown position, and values. */
export function sampleReveal(sample: Sample): Record<string, unknown> {
  const shown = { ...sample.view, answer_index: sample.answer }
  const { values } = sample
  if (values === undefined) return shown
  const options = sample.view.options as Record<string, unknown>[]
  return { ...shown, options: options.map((option, i) => ({ ...option, value: values[i] })) }
}

/** The server's speed buckets (`rooms/scoring.py`): the fraction of the time used, and its points. */
const BUCKETS: readonly [number, number][] = [
  [0.1, 1000],
  [0.25, 900],
  [0.5, 800],
  [0.75, 700],
  [1, 600],
]

/** Points for an answer `elapsedMs` into the sample, as the room scores one on speed. */
export function speedPoints(credit: number, elapsedMs: number): number {
  const fraction = elapsedMs / (SAMPLE_SECONDS * 1000)
  const bucket = BUCKETS.find(([upTo]) => fraction <= upTo)
  return bucket === undefined ? 0 : Math.round(bucket[1] * credit)
}

/** The row a room's reveal would give this answer, `elapsedMs` into the sample. */
export function sampleResult(sample: Sample, value: unknown, elapsedMs: number): PlayerResult {
  const credit = value === sample.answer ? 1 : 0
  return { value, correct: credit >= 1, credit, points: speedPoints(credit, elapsedMs) }
}

/** The mode to try after `mode`, in `order`, wrapping round; only modes with a sample. */
export function nextSample(mode: string, order: readonly string[]): string {
  const tried = order.filter((id) => id in SAMPLES)
  const at = tried.indexOf(mode)
  return tried[(at + 1) % tried.length] ?? mode
}
