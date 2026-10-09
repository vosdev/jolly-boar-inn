/**
 * For the component tests: what a line the scroll types in (`stage/Typed.svelte`) shows
 * the eye so far, and what it gives a screen reader.
 */

/** The letters typed so far: the line with its untyped rest and screen reader copy left out. */
export function seen(line: Element): string {
  const copy = line.cloneNode(true) as Element
  copy.querySelectorAll('.sr, .untyped').forEach((hidden) => hidden.remove())
  return copy.textContent ?? ''
}

/** What a screen reader gets of the line: everything not hidden from it. */
export function spoken(line: Element): string {
  const copy = line.cloneNode(true) as Element
  copy.querySelectorAll('[aria-hidden="true"]').forEach((hidden) => hidden.remove())
  return copy.textContent ?? ''
}

/** Whether the line is still typing, its mask still up. */
export function typing(line: Element): boolean {
  return line.querySelector('[aria-hidden="true"]') !== null
}
