<script lang="ts" module>
  import { MODES, type Mode } from '../lib/modes'
  import { STRANGER } from '../lib/randomEvents'

  /** Never a round anywhere (`custom`, `random_event`), or only on a server switched to testing. */
  const NOT_SHOWN = new Set(['custom', 'random_event', 'random_events_only'])

  /** The modes Home shows; each visit walks them in its own order. */
  export const SHOWN: readonly Mode[] = Object.values(MODES).filter(
    (mode) => !NOT_SHOWN.has(mode.id),
  )

  /** What a slide shows: a mode, or the random events under their stranger. */
  interface Slide {
    /** A mode's id, or `events`, as `howToPath` knows the views. */
    id: string
    label: string
    hint: string
    host: { id: string; name: string }
  }

  /** The Mysterious Old Man stands for every random event; his name opens their page. */
  const EVENTS: Slide = {
    id: 'events',
    label: 'Random events',
    hint: 'Every now and then, an NPC drops in mid-round with a surprise question.',
    host: { id: STRANGER, name: 'Mysterious Old Man' },
  }

  /** Every slide there is; each visit walks them in its own order. */
  export const SLIDES: readonly Slide[] = [...SHOWN, EVENTS]

  /** How long a mode stays before the next fades in. */
  export const ADVANCE_MS = 4500
</script>

<script lang="ts">
  /**
   * One game mode (or the random events) at a time on Home's sheet (section 8 of ideas/design.md): its host's
   * chathead, its name, its hint and who presents it, moving on by itself. The order is
   * shuffled per visit, so the first mode is not always the same one.
   *
   * Every slide is drawn in the same cell and only the current one shows, so the tallest
   * sets the height and nothing under the sheet moves as they change. The region is not
   * live: a screen reader announcing every 4.5 s would talk over the rest of the page.
   */
  import { onMount } from 'svelte'

  import { reducedMotion } from '../lib/interlude'
  import { npcArt } from '../lib/npcs'

  /** A slide's name opens its view on the How to play page. */
  let { onpick }: { onpick: (view: string) => void } = $props()

  const order = shuffled(SLIDES)
  let index = $state(0)
  let hovered = $state(false)
  let focused = $state(false)
  let hidden = $state(false)
  /** Read once, as every other moving part of the site reads it. */
  const still = reducedMotion()

  onMount(() => {
    const onVisibility = (): void => {
      hidden = document.visibilityState === 'hidden'
    }
    onVisibility()
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  })

  $effect(() => {
    if (still || hovered || focused || hidden) return
    const shown = index
    const timer = setTimeout(() => (index = (shown + 1) % order.length), ADVANCE_MS)
    return () => clearTimeout(timer)
  })

  /** A click focuses its chathead too, and only keyboard focus should hold the slideshow. */
  function onFocusIn(event: FocusEvent): void {
    const target = event.target
    focused = target instanceof Element && keyboardFocused(target)
  }

  function onFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget
    if (!(next instanceof Node) || !(event.currentTarget as Element).contains(next)) focused = false
  }

  /** A Fisher-Yates shuffle of a copy of `list`. */
  function shuffled<T>(list: readonly T[]): T[] {
    const copy = [...list]
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[copy[i], copy[j]] = [copy[j] as T, copy[i] as T]
    }
    return copy
  }

  function keyboardFocused(element: Element): boolean {
    try {
      return element.matches(':focus-visible')
    } catch {
      return true
    }
  }
</script>

<section
  class="showcase"
  aria-label="Game modes"
  onpointerenter={() => (hovered = true)}
  onpointerleave={() => (hovered = false)}
  onfocusin={onFocusIn}
  onfocusout={onFocusOut}
>
  <div class="stack">
    {#each order as mode, i (mode.id)}
      {@const art = npcArt(mode.host.id)}
      <div class="slide" class:on={i === index} inert={i !== index} data-mode={mode.id}>
        <img class="face {art.cut}" src={art.url} alt="" draggable="false" />
        <p class="name">
          <button type="button" class="open" onclick={() => onpick(mode.id)}>
            {mode.label}<span class="sr">, how to play</span>
          </button>
        </p>
        <p class="hint">{mode.hint}</p>
        <p class="by">Presented by: {mode.host.name}</p>
      </div>
    {/each}
  </div>
  <div class="picker">
    {#each order as mode, i (mode.id)}
      {@const art = npcArt(mode.host.id)}
      <button
        type="button"
        class="pick"
        class:on={i === index}
        aria-label={mode.label}
        aria-pressed={i === index}
        onclick={() => (index = i)}
      >
        <img class="face {art.cut}" src={art.url} alt="" draggable="false" />
      </button>
    {/each}
  </div>
</section>

<style>
  .showcase {
    display: grid;
    gap: 0.75rem;
    align-content: center;
  }

  .stack {
    display: grid;
  }

  /* The name and who presents it keep their rows whatever the hint's length. */
  .slide {
    grid-area: 1 / 1;
    display: grid;
    grid-template-columns: 96px minmax(0, 1fr);
    grid-template-rows: auto 1fr auto;
    column-gap: 1rem;
    opacity: 0;
    visibility: hidden;
    transition:
      opacity 0.6s ease,
      visibility 0s linear 0.6s;
  }

  /* In after the last one has mostly gone, so the two never read as one. */
  .slide.on {
    opacity: 1;
    visibility: visible;
    transition:
      opacity 0.6s ease 0.3s,
      visibility 0s;
  }

  .slide .face {
    grid-row: 1 / -1;
    align-self: start;
    width: 96px;
    height: 96px;
    object-fit: contain;
  }

  .face.render {
    object-fit: cover;
    object-position: top;
    transform: scaleX(-1);
  }

  .slide p {
    grid-column: 2;
    margin: 0;
  }

  .name {
    font-size: 1.5rem;
    line-height: 1.15;
  }

  /* The name in the sheet's own face and ink, underlined as How to play is beside it. */
  .open {
    min-height: 0;
    padding: 0;
    border: 0;
    background: none;
    color: var(--scroll-ink);
    font: inherit;
    text-align: start;
    text-decoration: underline;
    text-decoration-thickness: 1px;
    text-underline-offset: 0.15em;
  }

  .hint,
  .by {
    font-family: var(--font-body);
  }

  .hint {
    margin-top: 0.35rem;
  }

  .by {
    margin-top: 0.5rem;
    color: var(--scroll-muted);
    font-size: 0.85rem;
    font-weight: 600;
  }

  .picker {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }

  .pick {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    min-height: 0;
    padding: 0;
    border: 2px solid transparent;
    border-radius: 6px;
    background: none;
    opacity: 0.55;
  }

  .pick:hover,
  .pick.on {
    opacity: 1;
  }

  .pick.on {
    border-color: var(--scroll-ink);
  }

  .pick .face {
    width: 24px;
    height: 24px;
    object-fit: contain;
  }

  /* A row of eleven faces is too fine to aim at on a phone: dots, each a full finger wide. */
  @media (max-width: 26rem) {
    .picker {
      justify-content: center;
      gap: 0;
    }

    .pick {
      width: 28px;
      height: 44px;
      border: 0;
    }

    .pick .face {
      display: none;
    }

    .pick::before {
      content: '';
      width: 10px;
      height: 10px;
      border-radius: 50%;
      border: 2px solid var(--scroll-ink);
    }

    .pick.on::before {
      background: var(--scroll-ink);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .slide,
    .slide.on {
      transition: none;
    }
  }
</style>
