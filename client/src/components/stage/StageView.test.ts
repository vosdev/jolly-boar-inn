/** The random event's return: each step waits for the last, in `lib/interlude.ts`'s numbers. */

import { describe, expect, it } from 'vitest'

import {
  RETURN_GUEST_OUT_MS,
  RETURN_HOST_IN_MS,
  RETURN_MOVE_MS,
  RETURN_MS,
} from '../../lib/interlude'
import source from './StageView.svelte?raw'

/** The duration and delay of the animation a `.returning` rule plays, in ms. */
function timing(selector: string): { duration: number; delay: number } {
  const rule = source.match(
    new RegExp(`\\.returning ${selector} \\{[^}]*?animation: [\\w-]+ ([^;]+);`),
  )
  const [duration = NaN, delay = 0] = [...(rule?.[1] ?? '').matchAll(/(\d+)ms/g)].map((m) =>
    Number(m[1]),
  )
  return { duration, delay }
}

describe('the return', () => {
  it('fades the NPC out, then slides the scroll back, then fades the host in', () => {
    const guest = timing('\\.guest')
    const scroll = timing('> :global\\(\\.scroll\\)')
    const host = timing('\\.host')
    expect(guest).toEqual({ duration: RETURN_GUEST_OUT_MS, delay: 0 })
    expect(scroll).toEqual({ duration: RETURN_MOVE_MS, delay: guest.duration })
    expect(host).toEqual({ duration: RETURN_HOST_IN_MS, delay: scroll.delay + scroll.duration })
    expect(host.delay + host.duration).toBe(RETURN_MS)
  })
})
