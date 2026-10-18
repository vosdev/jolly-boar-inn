<script lang="ts">
  /**
   * A screen's stage (section 8 of ideas/design.md): its host, its words on the clue scroll,
   * and what goes under the line. `StageView` says how each prop is drawn.
   *
   * In a room every screen shares one stage (`lib/sharedStage.svelte.ts`), which moves
   * from one screen's size and host to the next rather than each drawing its own. There
   * this renders its parts out of sight and hands them over as it mounts; a stage outside
   * a room, Home's or a preview's, draws itself.
   *
   * `scene` names what the screen shows, so a question going from open to revealed, which
   * is a new screen, keeps the stage as it is. `within` is how long the screen's words can
   * wait to arrive, in ms.
   */
  import { onMount, untrack, type Snippet } from 'svelte'

  import type { Award } from '../../lib/award'
  import { sharedStage, type Look } from '../../lib/sharedStage.svelte'
  import StageView from './StageView.svelte'

  let {
    paper,
    beside,
    children,
    ...look
  }: {
    hero?: string | null
    host?: string
    paper: Snippet
    award?: Award
    board?: boolean
    guest?: string | null
    entering?: boolean
    returning?: boolean
    tall?: boolean
    beside?: Snippet
    children?: Snippet
    scene?: string | null
    within?: number
  } = $props()

  const shared = sharedStage()
  // Before anything changes hands, so the hand-over is the one the screen planned for.
  const scene = untrack(() => shared?.begin({ ...look } as Look) ?? null)

  let paperPart = $state<HTMLElement | null>(null)
  let underPart = $state<HTMLElement | null>(null)
  let besidePart = $state<HTMLElement | null>(null)

  $effect(() => {
    if (scene !== null) scene.look = { ...look }
  })

  onMount(() => {
    if (shared === null || scene === null || paperPart === null) return
    shared.enter(scene, {
      paper: paperPart,
      under: children ? underPart : null,
      beside: beside ? besidePart : null,
    })
    return () => shared.leave(scene)
  })
</script>

{#if shared === null}
  <StageView {...look} {paper} {beside} {children} />
{:else}
  <!-- Each part is moved onto the shared stage whole, and lays out as if it were the slot
       it lands in. -->
  <div hidden>
    <div class="part" bind:this={paperPart}>{@render paper()}</div>
    <div class="part" bind:this={underPart}>{@render children?.()}</div>
    <div class="part" bind:this={besidePart}>{@render beside?.()}</div>
  </div>
{/if}

<style>
  .part {
    display: contents;
  }
</style>
