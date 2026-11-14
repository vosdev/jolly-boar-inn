/**
 * The forms a suggestion of its own shape is written in, picked by `Choice.editor`.
 *
 * `SuggestionEditor` draws the frame every suggestion shares: the box, the step line and the
 * two columns around the form, and the difficulty, source and credit steps it hands in as
 * snippets, as it does to the shared question forms. The form draws the fields' column and
 * the one beside it. A form with a `type` is drawn only while that type is picked, so a round
 * that also takes the shared types can swap between them; one without is the choice's only
 * form. `stacks` keeps the columns stacked until a map has room beside the preview.
 */

import type { Component, Snippet } from 'svelte'

import type { OpenQuestion } from '../../lib/protocol'
import type {
  Choice,
  EditorKind,
  QuestionContent,
  SuggestedType,
  SuggestionContent,
} from '../../lib/suggestions'
import ItemForm from './ItemForm.svelte'
import NamedForm from './NamedForm.svelte'
import PlaceForm from './PlaceForm.svelte'

export interface FormProgress {
  questionDone: boolean
  extrasFilled: boolean
  extrasValid: boolean
}

export interface SuggestionFormProps {
  /** The editor's own `$props.id()`, so the form's ids and the frame's share one prefix. */
  id: string
  choice: Choice
  /** The suggestion's content to edit, or none for a new one. */
  content: SuggestionContent | undefined
  /** The names a shadow may not give: the game asks about them already. */
  asked: readonly string[]
  /** Every type the round offers, and what to do with one another form writes. */
  picker:
    { options: { value: string; label: string }[]; onpick: (type: string) => void } | undefined
  saveLabel: string
  /** Wraps the question's own fields in the first step's card. */
  stepQuestion: Snippet<[Snippet]>
  stepDifficulty: Snippet
  /** The frame's steps under the question's, given whether Save was pressed. */
  fields: Snippet<[boolean]>
  nearSave: Snippet
  /** The question as it shows open, and whether the preview may be answered. */
  preview: Snippet<[OpenQuestion, boolean]>
  /** Whether the frame's fields pass, asked on every Save. */
  onattempt: () => boolean
  /** Told the name the wiki page follows whenever it changes, from what it was. */
  onsubject: (before: string, after: string) => void
  /** Told the question whenever it changes: whole, or `undefined` while it has problems. */
  ondraft: (question: QuestionContent | undefined) => void
  onprogress: (state: FormProgress) => void
  onsave: (content: SuggestionContent) => void
  oncancel: () => void
}

export const SUGGESTION_FORMS: Record<
  EditorKind,
  { form: Component<SuggestionFormProps>; type?: SuggestedType; stacks?: boolean }
> = {
  shadow: { form: NamedForm, type: 'pick_from_list' },
  verse: { form: NamedForm, type: 'pick_from_list' },
  place: { form: PlaceForm, type: 'map_pin', stacks: true },
  item: { form: ItemForm },
}
