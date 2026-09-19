/**
 * Which component draws which question type.
 *
 * `Room.svelte` looks a type up in here rather than naming one: the screen should not
 * have to grow an `{#if}` per mode, and with five to ten modes coming it would be the
 * first thing to fall out of step with the server's registry.
 *
 * A type with no entry is not an error — a room can be playing a mode from a newer
 * server than this client was built against. `Room.svelte` says so and carries on.
 */

import type { Component } from 'svelte'

import MoreLess from './MoreLess.svelte'
import type { QuestionProps } from './props'

export const QUESTION_VIEWS: Record<string, Component<QuestionProps>> = {
  more_less: MoreLess,
}
