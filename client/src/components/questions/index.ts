/**
 * Which pair of components draws a question: the mode's stem and the type's view.
 *
 * A question is two things on screen. The *view* is how it is answered — two buttons,
 * four buttons, a text box — and is chosen by `OpenQuestion.type`, because the answer
 * shape is what the type is. The *stem* is what it is about — a sentence, an item, a line
 * of dialogue — and is chosen by `OpenQuestion.mode`, because five modes share the
 * `multiple_choice` view and would otherwise all look like one round played five times.
 *
 * `Question.svelte` looks a question up in here rather than naming components: the screen
 * should not have to grow an `{#if}` per mode, and with ten modes coming it would be the
 * first thing to fall out of step with the server's registry.
 *
 * Either half missing is not an error. A mode with no stem is drawn by its view alone,
 * which is what `more_less` wants and what a mode this build has no copy for gets. A type
 * with no view means a room is playing a pack from a newer server than this client, and
 * `Question.svelte` says so and the game carries on.
 */

import type { Component } from 'svelte'

import { MODES, type StemId } from '../../lib/modes'
import type { StemProps, TypeViewProps } from './props'
import AssetStem from './stems/AssetStem.svelte'
import ExamineStem from './stems/ExamineStem.svelte'
import TextStem from './stems/TextStem.svelte'
import MoreLess from './types/MoreLess.svelte'
import PickFromList from './types/PickFromList.svelte'
import PriceIsRight from './types/PriceIsRight.svelte'

export const TYPE_VIEWS: Record<string, Component<TypeViewProps>> = {
  more_less: MoreLess,
  price_is_right: PriceIsRight,
  pick_from_list: PickFromList,
}

// Keyed on `StemId` rather than `string`, so naming a stem in `lib/modes.ts` that has no
// component here fails `pnpm check` instead of quietly drawing nothing.
export const STEMS: Record<StemId, Component<StemProps>> = {
  text: TextStem,
  asset: AssetStem,
  examine: ExamineStem,
}

export interface QuestionPair {
  stem: Component<StemProps> | null
  view: Component<TypeViewProps> | null
}

export function viewFor(type: string, mode: string): QuestionPair {
  const stem = MODES[mode]?.stem ?? null
  return {
    stem: stem === null ? null : STEMS[stem],
    view: TYPE_VIEWS[type] ?? null,
  }
}
