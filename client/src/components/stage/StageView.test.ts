/** A random event's entrance and return: each step waits for the last, in the libs' numbers. */

import { describe, expect, it } from 'vitest'

import {
  RETURN_GUEST_OUT_MS,
  RETURN_HOST_IN_MS,
  RETURN_MOVE_MS,
  RETURN_MS,
} from '../../lib/interlude'
import { ENTER_MOVE_MS } from '../../lib/stageMoves'
import scrollSource from './ClueScroll.svelte?raw'
import source from './StageView.svelte?raw'

/** The duration and delay of the animation a rule for `state` plays, in ms. */
function timing(selector: string, state = 'returning'): { duration: number; delay: number } {
  const rule = source.match(
    new RegExp(`\\.${state} ${selector} \\{[^}]*?animation: [\\w-]+ ([^;]+);`),
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

  it('takes the words off the sheet with the NPC, before the scroll moves', () => {
    const words = scrollSource.match(/\n {2}\.content\.hidden \{[^}]*?animation: [\w-]+ (\d+)ms/)
    expect({ duration: Number(words?.[1]), delay: 0 }).toEqual(timing('\\.guest'))
  })
})

describe('the entrance', () => {
  it('slides the scroll over for as long as the shared stage holds the words back', () => {
    const scroll = timing('> :global\\(\\.scroll\\)', 'entering')
    expect(scroll).toEqual({ duration: ENTER_MOVE_MS, delay: 0 })
  })
})

describe('the speaker above the sheet', () => {
  it('keeps its chathead in its panel on a phone, where the sheet-side host stands on the sheet', () => {
    const rule = source.match(/\n {2}\.stage \.speaker \.npc \{([^}]*)\}/)?.[1] ?? ''
    expect(rule).toContain('position: relative')
    expect(rule).toContain('animation: none')
  })

  it('takes its chathead size from the room, 92px unless the room is compact', () => {
    expect(source).toMatch(/\.speaker \{\s*--head: var\(--head-size, 92px\);/)
  })

  it('hides or dims only the line under the name, never the name itself', () => {
    expect(source).toMatch(/\.bubble\.off \.speech > :global\(:not\(\.name\)\) \{/)
    expect(source).toMatch(/\.bubble\.dim \.speech > :global\(:not\(\.name\)\) \{/)
    expect(source).not.toMatch(/\.bubble\.(off|dim) \{/)
  })
})

describe('the pin', () => {
  it('hangs over the answers, since the sheet row stacks above them', () => {
    const rule = source.match(/\n {2}\.stage-row \{([^}]*)\}/)?.[1] ?? ''
    expect(rule).toContain('position: relative')
    expect(rule).toMatch(/z-index: [1-9]/)
  })
})

describe('the map', () => {
  it('keeps the host on a stacked map while players pin', () => {
    expect(source).not.toMatch(/\.map\.pinning \.speaker/)
    expect(source).not.toMatch(/\.stage\.map \.speaker \{[^}]*display: none/)
  })
})

describe('the sheet inside the stage', () => {
  it('is styled from the stage only at its root, never inside it', () => {
    const markup = scrollSource.slice(
      scrollSource.indexOf('</script>'),
      scrollSource.indexOf('<style>'),
    )
    const inside = new Set([
      ...[...markup.matchAll(/class="([^"]+)"/g)].flatMap((m) =>
        m[1]!.split(/\s+/).filter((name) => /^[\w-]+$/.test(name)),
      ),
      ...[...markup.matchAll(/class:([\w-]+)/g)].map((m) => m[1]!),
    ])
    inside.delete('scroll')
    const reached = [...source.matchAll(/:global\(([^)]*)\)/g)].flatMap((m) =>
      [...m[1]!.matchAll(/\.([\w-]+)/g)].map((c) => c[1]!),
    )
    expect(inside.size).toBeGreaterThan(5)
    expect(reached.filter((name) => inside.has(name))).toEqual([])
  })
})

describe('a map stage', () => {
  it('keeps the sheet it lifts over the map under the top bar and its menus', () => {
    const rule = source.match(/\n {2}\.stage\.map \{([^}]*)\}/)?.[1] ?? ''
    expect(rule).toContain('isolation: isolate;')
  })
})
