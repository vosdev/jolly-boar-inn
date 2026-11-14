/**
 * The way a menu or popover closes, shared so each one closes alike: Escape, a tap outside
 * it and, where asked, tabbing out of it. The action goes on the element that counts as
 * inside; `close` says which of the three did it, since only some of them hand focus back.
 *
 * Listeners sit on the window, so Escape works wherever focus is, unless `nested`: a
 * picker inside a menu closes on an Escape from within itself and stops it there, so the
 * menu around it stays open.
 */

export type Dismissed = 'escape' | 'outside' | 'tab'

export interface Dismissal {
  /** Whether it is open; closed, nothing closes it. */
  open: boolean
  close: (by: Dismissed) => void
  /** Elements outside the node that a tap may land on without closing it, like its control. */
  inside?: (Node | null | undefined)[]
  /** Whether a tap outside closes it. */
  outside?: boolean
  /** Whether focus leaving it closes it. */
  tab?: boolean
  nested?: boolean
}

/** Close `node`'s menu or popover on Escape, a tap outside it, or tabbing out of it. */
export function dismissable(
  node: HTMLElement,
  initial: Dismissal,
): { update: (next: Dismissal) => void; destroy: () => void } {
  let options = initial

  const within = (target: EventTarget | null): boolean =>
    target instanceof Node &&
    (node.contains(target) || (options.inside ?? []).some((other) => other?.contains(target)))

  const pointerdown = (event: PointerEvent): void => {
    if (!options.open || options.outside === false || within(event.target)) return
    options.close('outside')
  }
  const keydown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || !options.open) return
    if (options.nested === true) event.stopPropagation()
    options.close('escape')
  }
  const focusout = (event: FocusEvent): void => {
    const next = event.relatedTarget
    if (options.open && options.tab === true && next instanceof Node && !within(next)) {
      options.close('tab')
    }
  }

  const keys: EventTarget = initial.nested === true ? node : window
  window.addEventListener('pointerdown', pointerdown)
  keys.addEventListener('keydown', keydown as EventListener)
  node.addEventListener('focusout', focusout)
  return {
    update: (next) => (options = next),
    destroy: () => {
      window.removeEventListener('pointerdown', pointerdown)
      keys.removeEventListener('keydown', keydown as EventListener)
      node.removeEventListener('focusout', focusout)
    },
  }
}
