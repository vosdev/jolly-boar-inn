/**
 * The room's one stage (section 8 of ideas/design.md): the scroll and whoever stands
 * beside it, kept for the whole visit while the screens take turns on it.
 *
 * A screen's `Stage` does not draw a scroll of its own under a shared stage. It renders
 * its words, what goes under the line and what its speaker says where it always does, and
 * the shared stage moves those nodes onto its stage. Their effects stay the screen's, so
 * they end with it exactly as they would on a stage of its own; what the shared stage keeps
 * afterwards is plain DOM, which it fades off the sheet.
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

/** A speech bubble shown, dimmed, or keeping its room unseen. */
export type Bubble = 'on' | 'dim' | 'off'

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
  tv?: boolean
  wide?: boolean
  /** Whoever speaks stands above the sheet with a bubble; null or none, beside it. */
  bubble?: Bubble | null
}

/** The screen's nodes that go on the stage, each null where the screen has none. */
export interface Parts {
  paper: HTMLElement
  under: HTMLElement | null
  said: HTMLElement | null
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
      speaks: speaks(this.look),
      scene: this.look.scene ?? null,
      entering: this.look.entering ?? false,
    })
  }
}

const KEY = Symbol('shared stage')

const SLOTS = {
  paper: '.content',
  under: '.under',
  said: '.speech',
} as const

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
      this.#show(latest)
    }
    document.addEventListener('visibilitychange', finish)
    return () => document.removeEventListener('visibilitychange', finish)
  }

  /** How a screen with `look` would take the stage over now. */
  handoffFor(look: Look): Handoff {
    const to = castOf({ host: look.host ?? '', ...withoutUndefined(look), speaks: speaks(look) })
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
      this.#show(to)
      return
    }

    // Wherever the scroll is now, mid-move or not, is where this hand-over starts from.
    const start = unscaled(root, scroll.getBoundingClientRect())
    const startAt = offsetIn(root, start)
    this.#settle()
    const run = this.#run
    lock(scroll, start)
    // The bubble keeps its size while its words fade, rather than closing around them.
    const bubble = root.querySelector<HTMLElement>('.bubble:not(.shell)')
    if (bubble !== null) lock(bubble, unscaled(root, bubble.getBoundingClientRect()))
    this.#ghosts = from.parts === null ? [] : ghostsOf(root, from.parts, handoff.out)
    this.#place(to, true)
    if (handoff.kind === 'swap') this.presence = 'leaving'

    await wait(handoff.out)
    if (run !== this.#run) return
    this.#clearGhosts()
    if (bubble !== null) unlock(bubble)
    this.shown = to
    if (handoff.kind === 'swap') this.presence = 'away'
    await tick()
    if (run !== this.#run) return
    // The new screen's look may draw a slot the old one had not: its bubble.
    this.#place(to, true)

    unlock(scroll)
    const end = unscaled(root, scroll.getBoundingClientRect())
    const endAt = offsetIn(root, end)
    lock(scroll, end)
    const before: Keyframe = { width: `${start.width}px`, height: `${start.height}px` }
    const after: Keyframe = { width: `${end.width}px`, height: `${end.height}px` }
    // An event's entrance slides the scroll itself (`StageView`), so only its size moves here.
    const enter = handoff.kind === 'enter'
    if (!enter) {
      before.transform = `translate(${startAt.x - endAt.x}px, ${startAt.y - endAt.y}px)`
      after.transform = 'none'
    }
    this.#moving = scroll.animate([before, after], {
      duration: handoff.move,
      easing: enter ? 'ease-out' : 'ease-in-out',
    })
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

  /**
   * Shows a screen's look with its parts in place, at once and again once the look has
   * drawn: a slot the old look had not, the bubble, only exists then.
   */
  #show(scene: Scene): void {
    this.shown = scene
    this.#place(scene, false)
    void tick().then(() => {
      if (this.shown === scene) this.#place(scene, false)
    })
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
    const bubble = root?.querySelector<HTMLElement>('.bubble:not(.shell)') ?? null
    if (bubble !== null) unlock(bubble)
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

/** Whether a screen's speaker stands above its sheet: a bubble, except on the TV. */
function speaks(look: Look): boolean {
  return (look.bubble ?? null) !== null && look.tv !== true
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
  scene.parts?.said?.remove()
}

/**
 * Where `rect` stands from the stage's centre line and top. A move is measured here rather
 * than on the screen, so a page that shifts as a whole, a scrollbar coming or going, moves
 * nothing; and from the centre rather than the edge, because the stage stays centred as it
 * narrows when the lobby's hero leaves.
 */
function offsetIn(root: HTMLElement, rect: DOMRect): { x: number; y: number } {
  const at = unscaled(root, root.getBoundingClientRect())
  return { x: rect.left - (at.left + at.width / 2), y: rect.top - at.top }
}

/**
 * `rect` in the stage's own pixels rather than the window's. They differ on a TV, which
 * scales the whole stage, and what is set from a measure, a width or a move, is set in
 * the stage's.
 */
function unscaled(root: HTMLElement, rect: DOMRect): DOMRect {
  const scale = root.offsetWidth > 0 ? root.getBoundingClientRect().width / root.offsetWidth : 1
  if (scale === 1 || !Number.isFinite(scale) || scale <= 0) return rect
  return new DOMRect(rect.x / scale, rect.y / scale, rect.width / scale, rect.height / scale)
}

/** Holds the scroll, or the bubble, at `rect` while what is on it changes. */
function lock(box: HTMLElement, rect: DOMRect): void {
  box.classList.add('morphing')
  box.style.width = `${rect.width}px`
  box.style.height = `${rect.height}px`
}

function unlock(box: HTMLElement): void {
  box.classList.remove('morphing')
  box.style.width = ''
  box.style.height = ''
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
    const at = unscaled(root, slot.getBoundingClientRect())
    const within = unscaled(root, parent.getBoundingClientRect())
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
    // From where the slot stood: a returned event's words have already faded off, with
    // their bubble rather than the slot itself.
    ghost.animate([{ opacity: String(seenOpacity(slot, root)) }, { opacity: 0 }], {
      duration: ms,
      easing: 'ease-in',
      fill: 'forwards',
    })
    ghosts.push(ghost)
  }
  return ghosts
}

/** How opaque `node` is drawn: its own opacity times every ancestor's up to `root`. */
function seenOpacity(node: HTMLElement, root: HTMLElement): number {
  let opacity = 1
  for (let at: HTMLElement | null = node; at !== null && at !== root; at = at.parentElement) {
    const own = Number.parseFloat(getComputedStyle(at).opacity)
    if (!Number.isNaN(own)) opacity *= own
  }
  return opacity
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
