/**
 * The OSRS trivia questions page: each mode's Try a question sample, written out as text.
 *
 * Shared by the page and the build's crawlable copy (`site-branding.ts`), so it takes the
 * mode files' raw samples rather than `samples.ts`, which only a browser bundle can load.
 * A pictured mode's sample is left out: without its picture it asks nothing.
 */

import { phrasingFor } from '../components/questions/types/moreLess.ts'
import { HOW_TO_PATH, slugOf } from './seo.ts'

/** The part of a mode file's `sample` (`samples.ts`) the page writes out. */
export type TriviaSample =
  | {
      type: 'multiple_choice' | 'more_less'
      view: Record<string, unknown>
      answer: number
      values?: number[]
    }
  | { type: 'price_is_right'; view: Record<string, unknown>; value: number }
  | { type: 'ordering'; view: Record<string, unknown>; reveal: { rank: number; detail: string }[] }
  | {
      type: 'pick_from_list'
      view: Record<string, unknown>
      answer: number
      subject: { name: string }
    }

export interface TriviaMode {
  id: string
  label: string
  hint: string
  /** The host's first ask line, for a sample whose question is the host's to say. */
  ask: string
  pictured: boolean
  sample?: TriviaSample
}

export interface TriviaQuestion {
  mode: string
  label: string
  hint: string
  /** The mode's How to play page, where the question can be tried. */
  path: string
  question: string
  /** The item a price question names. */
  subject?: string
  /** A quotation, verse or anagram shown under the question. */
  quote?: string
  clues?: string[]
  options?: string[]
  answer: string
  /** What the reveal adds: the values, the ranks' facts, the date a price was read. */
  detail?: string
}

const gp = (value: number): string => `${value.toLocaleString('en-US')} gp`

/** Fixed, not the reader's locale: the server's copy and the page must say the same. */
function asOf(date: unknown): string | null {
  if (typeof date !== 'string') return null
  const parsed = new Date(`${date}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return null
  const day = parsed.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
  return `Prices as of ${day}.`
}

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value !== '' ? value : undefined

function written(
  mode: TriviaMode,
  sample: TriviaSample,
): Omit<TriviaQuestion, 'mode' | 'label' | 'hint' | 'path'> {
  const view = sample.view
  switch (sample.type) {
    case 'multiple_choice': {
      const options = view.options as string[]
      const quote = text(view.quote)
      return {
        // A quote-only question is asked by its host, in the bubble.
        question: text(view.prompt) ?? mode.ask,
        ...(quote === undefined ? {} : { quote }),
        options,
        answer: options[sample.answer] ?? '',
      }
    }
    case 'more_less': {
      const phrasing = phrasingFor(String(view.metric))
      const direction = view.direction === 'less' ? 'less' : 'more'
      const source = phrasing.source ? ` ${phrasing.source}` : ''
      const options = (view.options as { subject: { name: string } }[]).map(
        (option) => option.subject.name,
      )
      const values = sample.values ?? []
      const priced = options.map((name, i) =>
        values[i] === undefined ? name : `${name}: ${gp(values[i])}`,
      )
      const date = view.metric === 'ge_price' ? asOf(view.as_of) : null
      return {
        question: `Which ${phrasing.verb} ${direction}${source}?`,
        options,
        answer: options[sample.answer] ?? '',
        detail: [priced.join(', ') + '.', date].filter(Boolean).join(' '),
      }
    }
    case 'price_is_right': {
      const subject = view.subject as { name: string }
      const date = asOf(view.as_of)
      return {
        question: mode.ask,
        subject: subject.name,
        answer: gp(sample.value),
        ...(date === null ? {} : { detail: date }),
      }
    }
    case 'ordering': {
      const entries = (view.entries as { text: string }[]).map((entry, i) => ({
        text: entry.text,
        ...sample.reveal[i]!,
      }))
      const ranked = [...entries].sort((a, b) => a.rank - b.rank)
      const picks = typeof view.picks === 'number' ? view.picks : ranked.length
      return {
        question: String(view.prompt),
        options: entries.map((entry) => entry.text),
        answer: ranked
          .slice(0, picks)
          .map((entry) => entry.text)
          .join(', '),
        detail: ranked.map((entry) => `${entry.text}: ${entry.detail}`).join('. ') + '.',
      }
    }
    case 'pick_from_list': {
      const clues = Array.isArray(view.clues) ? (view.clues as string[]) : undefined
      const prompt = String(view.prompt)
      if (clues !== undefined) return { question: prompt, clues, answer: sample.subject.name }
      return { question: mode.ask, quote: prompt, answer: sample.subject.name }
    }
  }
}

/** Every unpictured mode's sample, in `modes` order. */
export function triviaQuestions(modes: readonly TriviaMode[]): TriviaQuestion[] {
  const questions: TriviaQuestion[] = []
  for (const mode of modes) {
    if (mode.pictured || mode.sample === undefined) continue
    const body = written(mode, mode.sample)
    questions.push({
      mode: mode.id,
      label: mode.label,
      hint: mode.hint,
      path: `${HOW_TO_PATH}/${slugOf(mode.label)}`,
      ...body,
    })
  }
  return questions
}
