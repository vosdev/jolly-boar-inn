/**
 * How to play's Try a question: one sample question per mode, played on the page alone.
 *
 * Written here rather than drawn from a pack, so nothing a player answers reaches the
 * server and nothing lands in anyone's stats. Only the lists the pick-from-list modes search
 * are fetched, the same ones a room's players get. Each sample is the `client_view` its type sends while
 * open, plus what that type's reveal and grade need; the grading is a copy of the server's,
 * held to it by `server/tests/sample_grading_cases.json`.
 *
 * A mode whose round asks only in other types has no sample, and its view offers no Try a
 * question. A mixed mode's sample is one of its types.
 */

import { npcArt } from './npcs'
import type { PlayerResult } from './protocol'
import { credit as sliderCredit } from './slider'

// An item's detail picture, fetched as its icon is and missing where nothing fetched it. An NPC's
// art is `lib/npcs.ts`'s; a question's own picture has a random name only the server knows.
const detailFiles = import.meta.glob<string>('../assets/items/detail_*.png', {
  eager: true,
  query: '?url',
  import: 'default',
})

interface SampleBase {
  mode: string
  /** `client_view(payload)`: what the question shows while open. */
  view: Record<string, unknown>
}

export interface OneAnswerSample extends SampleBase {
  type: 'more_less' | 'multiple_choice'
  /** The right answer's shown position. */
  answer: number
  /** More or Less's reveal: each option's value, in the shown order. */
  values?: number[]
}

interface PriceSample extends SampleBase {
  type: 'price_is_right'
  /** The price, on the slider's two-figure grid. */
  value: number
}

interface OrderingSample extends SampleBase {
  type: 'ordering'
  /** Each shown entry's rank and the fact the reveal puts beside it. */
  reveal: { rank: number; detail: string }[]
}

export interface ListSample extends SampleBase {
  type: 'pick_from_list'
  /** The vocabulary entry that is right, which is also the id of its art. */
  answer: number
  subject: { name: string }
  /** The mode's `Steps`, where its picture builds up and points fall with it. */
  steps?: { build: number; of: number }
}

export type Sample = OneAnswerSample | PriceSample | OrderingSample | ListSample

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
  price_is_right: {
    mode: 'price_is_right',
    type: 'price_is_right',
    view: {
      subject: { name: 'Dragon boots', asset: 'item:11840' },
      min: 70000,
      max: 150000,
      as_of: '2026-10-28',
    },
    value: 130000,
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
  sort_it_out: {
    mode: 'sort_it_out',
    type: 'ordering',
    view: {
      prompt: 'Which three of these fish heal the most, best first?',
      ends: ['Heals most', 'Heals least'],
      picks: 3,
      entries: [
        { text: 'Lobster' },
        { text: 'Shrimps' },
        { text: 'Shark' },
        { text: 'Trout' },
        { text: 'Swordfish' },
      ],
    },
    reveal: [
      { rank: 3, detail: 'Heals 12' },
      { rank: 5, detail: 'Heals 3' },
      { rank: 1, detail: 'Heals 20' },
      { rank: 4, detail: 'Heals 7' },
      { rank: 2, detail: 'Heals 14' },
    ],
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
  whos_that_npc: {
    mode: 'whos_that_npc',
    type: 'pick_from_list',
    view: { prompt: "Who's that NPC?", vocab: 'npcs' },
    answer: 817,
    subject: { name: 'Elvarg' },
  },
  pixel_hunt: {
    mode: 'pixel_hunt',
    type: 'pick_from_list',
    view: { prompt: 'Which item is this?', vocab: 'items' },
    answer: 4151,
    subject: { name: 'Abyssal whip' },
    steps: { build: 17, of: 25 },
  },
  forgetful_bard: {
    mode: 'forgetful_bard',
    type: 'pick_from_list',
    view: {
      prompt: "Seventy Attack, and hear it crack: an Abyss-born lash on a demon's back.",
      vocab: 'items',
    },
    answer: 4151,
    subject: { name: 'Abyssal whip' },
  },
}

/** How long a sample stays open, in seconds: its type's `ANSWER` at the room's usual pace. */
export function sampleSeconds(sample: Sample): number {
  switch (sample.type) {
    case 'more_less':
      return 10
    case 'multiple_choice':
      return 10 + 2 * (sample.view.options as unknown[]).length
    case 'price_is_right':
      return 15
    case 'ordering':
      return 10 + 5 * sample.reveal.length
    case 'pick_from_list':
      return 25
  }
}

/** The picture a room would send with the sample, as a URL, or null for none. */
export function samplePicture(
  sample: Sample,
  details: Record<string, string> = detailFiles,
): string | null {
  if (sample.type !== 'pick_from_list') return null
  if (sample.view.vocab === 'npcs') return npcArt(String(sample.answer)).url
  return details[`../assets/items/detail_${sample.answer}.png`] ?? null
}

/** What the type's reveal sends. */
export function sampleReveal(sample: Sample): Record<string, unknown> {
  switch (sample.type) {
    case 'more_less':
    case 'multiple_choice': {
      const shown = { ...sample.view, answer_index: sample.answer }
      const { values } = sample
      if (values === undefined) return shown
      const options = sample.view.options as Record<string, unknown>[]
      return { ...shown, options: options.map((option, i) => ({ ...option, value: values[i] })) }
    }
    case 'price_is_right':
      return { ...sample.view, value: sample.value }
    case 'ordering': {
      const entries = sample.view.entries as Record<string, unknown>[]
      const ranks = sample.reveal.map((entry) => entry.rank)
      return {
        ...sample.view,
        entries: entries.map((entry, i) => ({ ...entry, ...sample.reveal[i] })),
        answer: ranks.map((_, i) => i).sort((a, b) => ranks[a]! - ranks[b]!),
      }
    }
    case 'pick_from_list':
      return { ...sample.view, answer_id: sample.answer, subject: sample.subject }
  }
}

/**
 * `ordering.grade`: per place played, 1 for the rank that belongs there, and with `picks`
 * half for one that belongs in another. `ranks` are in shown order, as `value`'s positions.
 */
export function orderingCredit(
  ranks: number[],
  picks: number | undefined,
  value: number[],
): number {
  const wanted = [...ranks].sort((a, b) => a - b).slice(0, picks ?? ranks.length)
  const cut = wanted[wanted.length - 1]!
  const half = picks === undefined ? 0 : 0.5
  const earned = wanted.reduce((sum, rank, place) => {
    const placed = ranks[value[place]!]!
    if (placed === rank) return sum + 1
    return placed <= cut ? sum + half : sum
  }, 0)
  return earned / wanted.length
}

/** What the type's `grade` gives this answer, from 0 to 1. */
export function sampleCredit(sample: Sample, value: unknown): number {
  switch (sample.type) {
    case 'more_less':
    case 'multiple_choice':
    case 'pick_from_list':
      return value === sample.answer ? 1 : 0
    case 'price_is_right':
      return sliderCredit(
        sample.view.min as number,
        sample.view.max as number,
        sample.value,
        value as number,
      )
    case 'ordering':
      return orderingCredit(
        sample.reveal.map((entry) => entry.rank),
        sample.view.picks as number | undefined,
        value as number[],
      )
  }
}

/** The server's speed buckets (`rooms/scoring.py`): the fraction of the time used, and its points. */
const BUCKETS: readonly [number, number][] = [
  [0.1, 1000],
  [0.25, 900],
  [0.5, 800],
  [0.75, 700],
  [1, 600],
]

/** Points for an answer `elapsedMs` into `seconds`, as the room scores one on speed. */
export function speedPoints(credit: number, elapsedMs: number, seconds: number): number {
  const fraction = elapsedMs / (seconds * 1000)
  const bucket = BUCKETS.find(([upTo]) => fraction <= upTo)
  return bucket === undefined ? 0 : Math.round(bucket[1] * credit)
}

/** `rooms/scoring.py`'s `step` and `step_points`: what `elapsedMs` pays while a picture builds up. */
export function stepPoints(
  elapsedMs: number,
  seconds: number,
  steps: { build: number; of: number },
): number {
  const count = steps.build + 1
  let step = 1
  while (step < count && (elapsedMs / 1000) * steps.of > step * seconds) step += 1
  return Math.round(400 + (600 * (count - step)) / (count - 1))
}

/** The points a room would pay `credit`, `elapsedMs` into the sample. */
function samplePoints(sample: Sample, credit: number, elapsedMs: number): number {
  const seconds = sampleSeconds(sample)
  if (sample.type === 'pick_from_list' && sample.steps !== undefined) {
    return Math.round(stepPoints(elapsedMs, seconds, sample.steps) * credit)
  }
  return speedPoints(credit, elapsedMs, seconds)
}

/** The row a room's reveal would give this answer, `elapsedMs` into the sample. */
export function sampleResult(sample: Sample, value: unknown, elapsedMs: number): PlayerResult {
  const credit = sampleCredit(sample, value)
  return { value, correct: credit >= 1, credit, points: samplePoints(sample, credit, elapsedMs) }
}

/** The mode to try after `mode`, in `order`, wrapping round; only modes with a sample. */
export function nextSample(mode: string, order: readonly string[]): string {
  const tried = order.filter((id) => id in SAMPLES)
  const at = tried.indexOf(mode)
  return tried[(at + 1) % tried.length] ?? mode
}
