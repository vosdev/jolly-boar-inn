<script lang="ts">
  /**
   * The room's one stage (`lib/sharedStage.svelte.ts`), drawn with the look of whichever
   * screen has it and nothing at all between screens that have none.
   *
   * A TV's screen has it scaled as a whole, from its own size to `TV_SHARE` of the window
   * along whichever side it reaches first, and centred there, so the room reads it from
   * the sofa. The scale eases as the stage changes size, the reveal's panel widening, and
   * the timer bar hangs its tabs at the scaled stage's edges from `tvFit`.
   */
  import { onMount } from 'svelte'

  import type { SharedStage } from '../../lib/sharedStage.svelte'
  import { fitScale, tvFit } from '../../lib/tv'
  import StageView from './StageView.svelte'

  let { stage }: { stage: SharedStage } = $props()

  let root = $state<HTMLElement | null>(null)
  const tv = $derived(stage.shown?.look.tv ?? null)
  let scale = $state(1)

  $effect(() => stage.attach(root))

  $effect(() => {
    const at = root
    if (tv === null || at === null) return
    const fit = (): void => {
      const natural = { width: at.offsetWidth, height: at.offsetHeight }
      const fitted = fitScale(natural, { width: innerWidth, height: innerHeight })
      scale = fitted
      tvFit.set({ scale: fitted, width: natural.width * fitted })
    }
    fit()
    const watch = new ResizeObserver(fit)
    watch.observe(at)
    addEventListener('resize', fit)
    return () => {
      watch.disconnect()
      removeEventListener('resize', fit)
      tvFit.set(null)
      scale = 1
    }
  })

  onMount(() => () => tvFit.set(null))
</script>

<div class="shared" class:empty={stage.shown === null} class:tv={tv !== null}>
  <div class="fit" style:--tv-scale={tv === null ? null : scale}>
    <StageView {...stage.shown?.look} slots presence={stage.presence} bind:root />
  </div>
</div>

<style>
  .empty {
    display: none;
  }

  /* Over the whole window, so the centre is the window's and not the column's; the TV is
     never touched, so the top bar's menu stays reachable through it. */
  .tv {
    position: fixed;
    inset: 0;
    display: grid;
    place-items: center;
    pointer-events: none;
  }

  .tv .fit {
    transform: scale(var(--tv-scale, 1));
    transition: transform 250ms ease-in-out;
  }

  @media (prefers-reduced-motion: reduce) {
    .tv .fit {
      transition: none;
    }
  }
</style>
