/**
 * Who picked each option of a reveal, drawn on its gem (section 3 of ideas/design.md):
 * `multiple_choice` and `more_less` only, in the desktop room only. A phone has the results
 * sheet and the TV its own panel, so neither sets this.
 *
 * The room shares one `RevealPickers`, as it shares its table, so a type view reads who is
 * who without the question's props growing a player list that previews would have to fake.
 */

import { getContext, setContext } from 'svelte'

import type { PlayerResult } from './protocol'

/** The context key, exported for tests that stand in for the room. */
export const PICKERS_CONTEXT = Symbol('reveal pickers')

/** How many pickers the right answer names, and how many a wrong option does. */
export const RIGHT_SHOWN = 5
export const WRONG_SHOWN = 4

export interface Picker {
  id: string
  /** "you" for this client's player. */
  name: string
  pet: string
  you: boolean
}

export interface Pickers {
  shown: Picker[]
  /** Pickers past the ones shown: "and N more". */
  more: number
}

export class RevealPickers {
  /** Off where the gems name nobody: a phone, the TV. */
  on = $state(false)
  youId = $state<string | null>(null)
  /** `settings.name_wrong_answers`: whether a wrong option names its pickers. */
  showNames = $state(true)
  /** A player's name and pet, from the room or the standings; null for one long gone. */
  who: (id: string) => { name: string; pet: string } | null = () => null
}

/** Gives the room's reveal its pickers. */
export function sharePickers(pickers: RevealPickers): void {
  setContext(PICKERS_CONTEXT, pickers)
}

/** The room's pickers, or null where there is no room: a preview, a test. */
export function revealPickers(): RevealPickers | null {
  return getContext<RevealPickers | undefined>(PICKERS_CONTEXT) ?? null
}

/**
 * Who picked option `index` as the gem names them: you first, then the rest A–Z. Null when
 * it names nobody: no room, a phone or the TV, nobody picked it, or a wrong option in a
 * room that keeps wrong answers unnamed.
 */
export function pickersAt(
  pickers: RevealPickers | null,
  results: Record<string, PlayerResult> | null,
  index: number,
  right: boolean,
): Pickers | null {
  if (pickers === null || !pickers.on || results === null) return null
  if (!right && !pickers.showNames) return null
  const all = Object.entries(results)
    .filter(([, result]) => result.value === index)
    .map(([id]): Picker => {
      const you = id === pickers.youId
      const known = pickers.who(id)
      return {
        id,
        name: you ? 'you' : (known?.name ?? 'Someone who left'),
        pet: known?.pet ?? '',
        you,
      }
    })
    .sort((a, b) => Number(b.you) - Number(a.you) || a.name.localeCompare(b.name))
  if (all.length === 0) return null
  const shown = all.slice(0, right ? RIGHT_SHOWN : WRONG_SHOWN)
  return { shown, more: all.length - shown.length }
}
