<script lang="ts">
  /**
   * The room's one stage (`lib/sharedStage.svelte.ts`), drawn with the look of whichever
   * screen has it and nothing at all between screens that have none.
   */
  import type { SharedStage } from '../../lib/sharedStage.svelte'
  import StageView from './StageView.svelte'

  let { stage }: { stage: SharedStage } = $props()

  let root = $state<HTMLElement | null>(null)

  $effect(() => stage.attach(root))
</script>

<div class="shared" class:empty={stage.shown === null}>
  <StageView {...stage.shown?.look} slots presence={stage.presence} bind:root />
</div>

<style>
  .empty {
    display: none;
  }
</style>
