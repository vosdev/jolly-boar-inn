/**
 * The validation and progress every question form shares: `CustomQuestionForm`,
 * `MatchingForm` and `OrderingForm` build a question their own way and hand it here.
 *
 * Nothing is red until the first Save except a limit that is already broken, a problem the
 * form has no place for is listed under it, and Save hands back only a question with no
 * problems. The caller hears the question, whole or `undefined`, and how far it has got.
 */

import type { Problem } from './questionSchema'

/** How far the author has got: the question itself, and the optional extras. */
export interface Progress {
  questionDone: boolean
  extrasFilled: boolean
  extrasValid: boolean
}

export interface QuestionFormSetup<Q> {
  /** The question Save hands back, its asker included. */
  asked: () => Q
  /** What is wrong with the question as built. */
  problems: () => Problem[]
  /** The question must name who asks it and does not yet. */
  unnamed: () => boolean
  /** Whether the form shows a problem at `path` beside its field. */
  placed: (path: string) => boolean
  /** The paths of the optional extras, which do not hold the question up. */
  extras: ReadonlySet<string>
  /** Whether the author has written any of the extras. */
  extrasFilled: () => boolean
  /** The caller's own fields, checked on every Save. */
  onattempt: () => boolean
  onsave: (question: Q) => void
  ondraft: () => ((question: Q | undefined) => void) | undefined
  onprogress: () => ((progress: Progress) => void) | undefined
}

const UNNAMED: Problem = { path: 'random_event', message: 'Pick who asks it.', kind: 'missing' }

export class QuestionForm<Q> {
  /** Save has been pressed once: from then on every problem shows. */
  attempted = $state(false)
  readonly #setup: QuestionFormSetup<Q>

  readonly found = $derived.by(() => [
    ...this.#setup.problems(),
    ...(this.#setup.unnamed() ? [UNNAMED] : []),
  ])
  readonly shown = $derived(
    this.attempted ? this.found : this.found.filter((problem) => problem.kind === 'limit'),
  )
  readonly unplaced = $derived(this.shown.filter((problem) => !this.#setup.placed(problem.path)))
  readonly questionDone = $derived(this.found.every((p) => this.#setup.extras.has(p.path)))
  readonly extrasFilled = $derived.by(() => this.#setup.extrasFilled())
  readonly extrasValid = $derived(this.found.every((p) => !this.#setup.extras.has(p.path)))

  /** Call while a component initialises: it reports to the caller from effects. */
  constructor(setup: QuestionFormSetup<Q>) {
    this.#setup = setup
    $effect(() => setup.ondraft()?.(this.found.length === 0 ? setup.asked() : undefined))
    $effect(() => {
      const { questionDone, extrasFilled, extrasValid } = this
      setup.onprogress()?.({ questionDone, extrasFilled, extrasValid })
    })
  }

  /** The messages to show beside the field at `paths`, one path or several. */
  errorsAt(paths: string | readonly string[]): string[] {
    const at = typeof paths === 'string' ? [paths] : paths
    return this.shown.filter((problem) => at.includes(problem.path)).map((p) => p.message)
  }

  save(): void {
    this.attempted = true
    const rest = this.#setup.onattempt()
    if (this.found.length === 0 && rest) this.#setup.onsave(this.#setup.asked())
  }
}
