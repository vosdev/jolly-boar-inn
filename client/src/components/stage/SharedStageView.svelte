<script lang="ts">
  /**
   * The room's one stage (`lib/sharedStage.svelte.ts`), drawn with the look of whichever
   * screen has it and nothing at all between screens that have none.
   *
   * A TV's screen has it scaled as a whole, from its own size to `TV_SHARE` of the window
   * along whichever side it reaches first, and centred there, so the room reads it from
   * the sofa. The stage is made at least the window's shape (`tvMinHeight`), so a screen
   * whose words are short keeps the scale of one whose words are long, and the timer bar
   * hangs its tabs at the scaled stage's edges from `tvFit`.
   */
  import { onMount } from 'svelte'

  import type { SharedStage } from '../../lib/sharedStage.svelte'
  import { fitScale, tvFit, tvMinHeight } from '../../lib/tv'
  import StageView from './StageView.svelte'

  let { stage }: { stage: SharedStage } = $props()

  let root = $state<HTMLElement | null>(null)
  const tv = $derived(stage.shown?.look.tv === true)
  let scale = $state(1)
  let minHeight = $state(0)

  $effect(() => stage.attach(root))

  $effect(() => {
    const at = root
    if (!tv || at === null) return
    const fit = (): void => {
      const view = { width: innerWidth, height: innerHeight }
      const least = tvMinHeight(at.offsetWidth, view)
      const natural = { width: at.offsetWidth, height: Math.max(at.offsetHeight, least) }
      const fitted = fitScale(natural, view)
      minHeight = least
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
      minHeight = 0
    }
  })

  onMount(() => () => tvFit.set(null))
</script>

<div class="shared" class:empty={stage.shown === null} class:tv>
  <div
    class="fit"
    style:--tv-scale={tv ? scale : null}
    style:--tv-min-height={tv ? `${minHeight}px` : null}
  >
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
