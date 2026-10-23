/** The fade between screens: the old one out (150 ms), then the new one in (200 ms). */
import { fade } from 'svelte/transition'

import { reducedMotion } from './interlude'

const OUT_MS = 150
const IN_MS = 200

/** Reduced motion and jsdom, which has no Web Animations, cut instead. */
function cuts(): boolean {
  return reducedMotion() || typeof Element.prototype.animate !== 'function'
}

export function routeOut(node: Element): ReturnType<typeof fade> {
  return fade(node, { duration: cuts() ? 0 : OUT_MS })
}

export function routeIn(node: Element): ReturnType<typeof fade> {
  return fade(node, { duration: cuts() ? 0 : IN_MS, delay: cuts() ? 0 : OUT_MS })
}
