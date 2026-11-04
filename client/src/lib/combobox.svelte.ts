/**
 * The WAI-ARIA combobox's state and keys, shared by every search-and-pick box: an input
 * with `role="combobox"` that keeps focus, a `listbox` popup, and `aria-activedescendant`
 * naming the highlighted option, so a screen reader hears the highlight move.
 *
 * Arrow keys open the list or move the highlight, Enter picks the highlighted option, and
 * Escape closes. Each component draws its own input and options, and says what opening and
 * picking mean for it.
 */

import { tick } from 'svelte'

export interface ComboboxKeys {
  /** How many options are shown, so the highlight stays on one. */
  count: number
  /** An arrow key on a closed list. */
  open: () => void
  /** Enter on the highlighted option, by its place in the shown list. */
  pick: (index: number) => void
  /** Strict boxes only pick; a free one closes on an Enter with nothing highlighted. */
  strict: boolean
}

export class Combobox {
  expanded = $state(false)
  active = $state(0)
  listbox = $state<HTMLUListElement | null>(null)
  readonly listId: string
  readonly #uid: string

  constructor(uid: string) {
    this.#uid = uid
    this.listId = `${uid}-list`
  }

  optionId(index: number): string {
    return `${this.#uid}-option-${index}`
  }

  /** Move the highlight to `index`, kept within `count` options, and scroll it into view. */
  async highlight(index: number, count: number): Promise<void> {
    this.active = Math.max(0, Math.min(count - 1, index))
    await tick()
    this.listbox
      ?.querySelector(`#${CSS.escape(this.optionId(this.active))}`)
      ?.scrollIntoView?.({ block: 'nearest' })
  }

  keydown(event: KeyboardEvent, keys: ComboboxKeys): void {
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp':
        event.preventDefault()
        if (!this.expanded) keys.open()
        else void this.highlight(this.active + (event.key === 'ArrowDown' ? 1 : -1), keys.count)
        break
      case 'Enter':
        // Enter picks; it never submits a form the box sits in.
        event.preventDefault()
        if (this.expanded && this.active < keys.count) keys.pick(this.active)
        else if (!keys.strict) this.expanded = false
        break
      case 'Escape':
        if (this.expanded) {
          event.preventDefault()
          this.expanded = false
        }
        break
    }
  }
}
