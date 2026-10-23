/**
 * Hides and shows a tab that stays mounted (it keeps its state), with the fade a route
 * change has: out (150 ms), then in (200 ms). `use:tabFade={hidden}` in place of `hidden`.
 */
import { reducedMotion } from './interlude'
import { IN_MS, OUT_MS, cuts } from './routeFade'

export function tabFade(node: HTMLElement, hidden: boolean): { update: (hidden: boolean) => void } {
  let want = hidden
  let timer: ReturnType<typeof setTimeout> | undefined
  let running: Animation | undefined
  node.hidden = hidden

  function fade(from: number, to: number, ms: number): void {
    running = node.animate([{ opacity: from }, { opacity: to }], { duration: ms, easing: 'linear' })
  }

  return {
    update(next) {
      if (next === want) return
      want = next
      clearTimeout(timer)
      running?.cancel()
      if (cuts() || reducedMotion()) {
        node.hidden = next
        return
      }
      if (next) {
        fade(Number(getComputedStyle(node).opacity), 0, OUT_MS)
        timer = setTimeout(() => (node.hidden = true), OUT_MS)
      } else {
        timer = setTimeout(() => {
          node.hidden = false
          fade(0, 1, IN_MS)
        }, OUT_MS)
      }
    },
  }
}
