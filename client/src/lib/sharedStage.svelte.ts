/**
 * The room's one stage (section 8 of ideas/design.md): the scroll and whoever stands
 * beside it, kept for the whole visit while the screens take turns on it.
 *
 * A screen's `Stage` does not draw a scroll of its own under a shared stage. It renders
 * its words, what goes under the line and what stands beside it where it always does,
 * and the shared stage moves those three nodes onto its sheet. Their effects stay the
 * screen's, so they end with it exactly as they would on a stage of its own; what the
 * shared stage keeps afterwards is plain DOM, which it fades off the sheet.
 *
 * Each hand-over is `lib/stageMoves.ts`'s. The screen asks for it at its start, before
 * the stage changes hands, so its own clock can wait for its words to arrive; the stage
 * plays the same one once the screen is mounted. A screen arriving mid-way through a
 * hand-over takes the stage over from wherever it has got to. A hidden page cuts: its
 * timers are slowed to a crawl, so a hand-over there would keep a locked phone's next
 * question out of sight, and one under way finishes at once when the page comes back.
 */

import { getContext, setContext, tick } from 'svelte'

import type { Award } from './award'
import { CUT, WORDS_IN_MS, castOf, handoffFor, type Cast, type Handoff } from './stageMoves'

/** What the stage draws for a screen, apart from the words. */
export interface Look {
  host?: string
  hero?: string | null
  award?: Award
  guest?: string | null
  entering?: boolean
  returning?: boolean
  tall?: boolean
  scene?: string | null
  within?: number
}

/** The screen's nodes that go on the stage, each null where the screen has none. */
export interface Parts {
  paper: HTMLElement
  under: HTMLElement | null
  beside: HTMLElement | null
}

/** Whether the host or guest is standing, leaving, gone or walking on. */
export type Presence = 'here' | 'leaving' | 'away' | 'arriving'

export class Scene {
  look = $state<Look>({})
  parts: Parts | null = null
  readonly handoff: Handoff

  constructor(handoff: Handoff) {
    this.handoff = handoff
  }

  get cast(): Cast {
    return castOf({
      host: this.look.host ?? '',
      hero: this.look.hero ?? null,
      guest: this.look.returning ? null : (this.look.guest ?? null),
      tall: this.look.tall ?? false,
      scene: this.look.scene ?? null,
      entering: this.look.entering ?? false,
    })
  }
}

const KEY = Symbol('shared stage')

const SLOTS = { paper: '.content', under: '.under', beside: '.beside' } as const

export class SharedStage {
  /** The screen whose look the stage draws; null leaves the stage empty. */
  shown = $state<Scene | null>(null)
  presence = $state<Presence>('here')
  /** The last screen to take the stage, which the next one takes it over from. */
  #latest: Scene | null = null
  /** The last screen, ended, until the next one claims the stage or nothing does. */
  #retired: Scene | null = null
  #root: HTMLElement | null = null
  /** Bumped by every hand-over, so a stale one stops where it is. */
  #run = 0
  #ghosts: HTMLElement[] = []
  #moving: Animation | null = null
  #fading: Animation[] = []

  /** The element `StageView` draws the shared stage into; returns the detach. */
  attach(root: HTMLElement | null): () => void {
    this.#root = root
    const finish = (): void => {
      if (document.visibilityState === 'hidden') return
      this.#settle()
      const latest = this.#latest
      if (latest === null || this.shown === latest) return
      if (this.shown !== null) removeParts(this.shown)
      this.shown = latest
      this.#place(latest, false)
    }
    document.addEventListener('visibilitychange', finish)
    return () => document.removeEventListener('visibilitychange', finish)
  }

  /** How a screen with `look` would take the stage over now. */
  handoffFor(look: Look): Handoff {
    const to = castOf({ host: look.host ?? '', ...withoutUndefined(look) })
    if (this.#root === null || typeof this.#root.animate !== 'function') return CUT
    if (document.visibilityState === 'hidden') return CUT
    return handoffFor(this.#latest?.cast ?? null, to)
  }

  /** A screen starting: its look is set, and its parts come with `enter`. */
  begin(look: Look): Scene {
    const scene = new Scene(this.handoffFor(look))
    scene.look = look
    return scene
  }

  /** A mounted screen's parts arriving on the stage. */
  enter(scene: Scene, parts: Parts): void {
    scene.parts = parts
    const from = this.#latest
    this.#retired = null
    this.#latest = scene
    void this.#handover(from, scene)
  }

  /** A screen ending. Its parts stay drawn until the next screen takes the stage. */
  leave(scene: Scene): void {
    if (this.#latest !== scene) {
      removeParts(scene)
      return
    }
    this.#retired = scene
    // The next screen claims the stage as it mounts, in the same turn as this one ends.
    setTimeout(() => {
      if (this.#retired !== scene) return
      this.#retired = null
      this.#latest = null
      this.#settle()
      removeParts(scene)
      this.shown = null
    }, 0)
  }

  async #handover(from: Scene | null, to: Scene): Promise<void> {
    const root = this.#root
    const scroll = root?.querySelector<HTMLElement>('.scroll') ?? null
    const handoff = to.handoff
    if (root === null || scroll === null || from === null || handoff.kind === 'cut') {
      this.#settle()
      if (from !== null) removeParts(from)
      this.shown = to
      this.#place(to, false)
      return
    }

    // Wherever the scroll is now, mid-move or not, is where this hand-over starts from.
    const start = scroll.getBoundingClientRect()
    const startAt = offsetIn(root, start)
    this.#settle()
    const run = this.#run
    lock(scroll, start)
    this.#ghosts = from.parts === null ? [] : ghostsOf(root, from.parts, handoff.out)
    this.#place(to, true)
    if (handoff.kind === 'swap') this.presence = 'leaving'

    await wait(handoff.out)
    if (run !== this.#run) return
    this.#clearGhosts()
    this.shown = to
    if (handoff.kind === 'swap') this.presence = 'away'
    await tick()
    if (run !== this.#run) return

    unlock(scroll)
    const end = scroll.getBoundingClientRect()
    const endAt = offsetIn(root, end)
    lock(scroll, end)
    this.#moving = scroll.animate(
      [
        {
          width: `${start.width}px`,
          height: `${start.height}px`,
          transform: `translate(${startAt.x - endAt.x}px, ${startAt.y - endAt.y}px)`,
        },
        { width: `${end.width}px`, height: `${end.height}px`, transform: 'none' },
      ],
      { duration: handoff.move, easing: 'ease-in-out' },
    )
    await wait(handoff.move)
    if (run !== this.#run) return
    this.#moving = null
    unlock(scroll)

    if (handoff.kind === 'swap') {
      this.presence = 'arriving'
      await wait(handoff.in)
      if (run !== this.#run) return
      this.presence = 'here'
    }
    this.#fading = slotsOf(root).map((slot) =>
      slot.animate([{ opacity: 0 }, { opacity: 1 }], { duration: WORDS_IN_MS, easing: 'ease-out' }),
    )
    reveal(root)
  }

  /** Puts a screen's parts in the stage's slots, held invisible while `hidden`. */
  #place(scene: Scene, hidden: boolean): void {
    const root = this.#root
    if (root === null || scene.parts === null) return
    for (const [part, selector] of Object.entries(SLOTS)) {
      const node = scene.parts[part as keyof Parts]
      const slot = root.querySelector<HTMLElement>(selector)
      if (node !== null && slot !== null) slot.append(node)
    }
    if (hidden) {
      for (const slot of slotsOf(root)) {
        slot.style.opacity = '0'
        slot.style.pointerEvents = 'none'
      }
    }
  }

  /** Ends whatever hand-over is running, with everything where it was going. */
  #settle(): void {
    this.#run++
    this.#moving?.cancel()
    this.#moving = null
    this.#fading.forEach((fade) => fade.cancel())
    this.#fading = []
    this.#clearGhosts()
    const root = this.#root
    const scroll = root?.querySelector<HTMLElement>('.scroll') ?? null
    if (scroll !== null) unlock(scroll)
    if (root !== null) reveal(root)
    this.presence = 'here'
  }

  #clearGhosts(): void {
    this.#ghosts.forEach((ghost) => ghost.remove())
    this.#ghosts = []
  }
}

/** Gives the room's screens one stage to share. */
export function shareStage(stage: SharedStage): void {
  setContext(KEY, stage)
}

/** The room's shared stage, or null where a stage draws itself: Home, a preview. */
export function sharedStage(): SharedStage | null {
  return getContext<SharedStage | undefined>(KEY) ?? null
}

/** When a screen with `look` will have its words on the stage, in ms from now. */
export function stageArrival(look: Look & { host: string }): number {
  return sharedStage()?.handoffFor(look).arrival ?? 0
}

function withoutUndefined(look: Look): Partial<Cast> {
  return Object.fromEntries(
    Object.entries(look).filter(([, value]) => value !== undefined),
  ) as Partial<Cast>
}

function slotsOf(root: HTMLElement): HTMLElement[] {
  return Object.values(SLOTS)
    .map((selector) => root.querySelector<HTMLElement>(selector))
    .filter((slot) => slot !== null)
}

function reveal(root: HTMLElement): void {
  for (const slot of slotsOf(root)) {
    slot.style.opacity = ''
    slot.style.pointerEvents = ''
  }
}

function removeParts(scene: Scene): void {
  scene.parts?.paper.remove()
  scene.parts?.under?.remove()
  scene.parts?.beside?.remove()
}

/**
 * Where `rect` stands within the stage. A move is measured here rather than on the
 * screen, so a page that shifts as a whole, a scrollbar coming or going, moves nothing.
 */
function offsetIn(root: HTMLElement, rect: DOMRect): { x: number; y: number } {
  const at = root.getBoundingClientRect()
  return { x: rect.left - at.left, y: rect.top - at.top }
}

/** Holds the scroll at `rect` while what is on it changes. */
function lock(scroll: HTMLElement, rect: DOMRect): void {
  scroll.classList.add('morphing')
  scroll.style.width = `${rect.width}px`
  scroll.style.height = `${rect.height}px`
}

function unlock(scroll: HTMLElement): void {
  scroll.classList.remove('morphing')
  scroll.style.width = ''
  scroll.style.height = ''
}

/**
 * The old screen's parts as they stood, fading over `ms`: each moves into a box of its
 * slot's size and place, laid out as the slot was, inside the slot's parent so the
 * sheet's inks and type still reach it.
 */
function ghostsOf(root: HTMLElement, parts: Parts, ms: number): HTMLElement[] {
  const ghosts: HTMLElement[] = []
  for (const [part, selector] of Object.entries(SLOTS)) {
    const node = parts[part as keyof Parts]
    const slot = root.querySelector<HTMLElement>(selector)
    const parent = slot?.parentElement ?? null
    if (node === null || slot === null || parent === null || !slot.contains(node)) continue
    const at = slot.getBoundingClientRect()
    const within = parent.getBoundingClientRect()
    const style = getComputedStyle(slot)
    const ghost = document.createElement('div')
    ghost.className = 'stage-ghost'
    ghost.setAttribute('aria-hidden', 'true')
    ghost.inert = true
    Object.assign(ghost.style, {
      position: 'absolute',
      zIndex: '2',
      left: `${at.left - within.left}px`,
      top: `${at.top - within.top}px`,
      width: `${at.width}px`,
      height: `${at.height}px`,
      display: style.display,
      flexDirection: style.flexDirection,
      pointerEvents: 'none',
    })
    ghost.append(node)
    parent.append(ghost)
    ghost.animate([{ opacity: 1 }, { opacity: 0 }], { duration: ms, easing: 'ease-in', fill: 'forwards' })
    ghosts.push(ghost)
  }
  return ghosts
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
