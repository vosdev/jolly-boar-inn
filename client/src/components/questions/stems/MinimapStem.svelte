<script module lang="ts">
  import type { Line } from '../../../lib/typing.svelte'

  /** What the stem types, line by line: the prompt, as `TextStem` does. */
  export function lines(data: Record<string, unknown>): Line[] {
    const prompt = typeof data.prompt === 'string' ? data.prompt : ''
    return prompt === '' ? [] : [prompt]
  }
</script>

<script lang="ts">
  /**
   * A question about a minimap: the prompt, then the minimap round the spot, in its ring.
   *
   * It reads `prompt` and the picture's file, or in `/suggest`'s preview the `minimap` spot,
   * which it draws from the tiles. On a map stage the minimap leaves the sheet for a card of
   * its own on the map, as KGP Recon's photo does: Hide puts it away and Show minimap brings it
   * back. Anywhere else, the TV's stage among them, it stays on the sheet and is the main thing.
   */
  import type { MinimapSpot } from '../../../lib/minimap'
  import { pictureUrl } from '../../../lib/pictures'
  import { toStage } from '../../../lib/stageCard'
  import Minimap from '../../map/Minimap.svelte'
  import Typed from '../../stage/Typed.svelte'
  import type { StemProps } from '../props'

  let { data, shown }: StemProps = $props()

  const prompt = $derived(lines(data)[0])
  const src = $derived(pictureUrl(typeof data.picture === 'string' ? data.picture : null))
  const spot = $derived(src === null ? ((data.minimap as MinimapSpot | undefined) ?? null) : null)

  let onStage = $state(false)
  let hidden = $state(false)
</script>

{#if prompt !== undefined}
  <p class="ask"><Typed line={prompt} shown={shown?.[0]} /></p>
{/if}
{#if onStage && hidden}
  <button type="button" class="show" onclick={() => (hidden = false)}>
    <svg viewBox="0 0 24 24" aria-hidden="true"
      ><circle cx="12" cy="12" r="8" /><path d="M12 7l2 5h-4z" /></svg
    >
    Show minimap
  </button>
{/if}
<figure
  class="chart"
  class:card={onStage}
  class:away={onStage && hidden}
  {@attach (card) => toStage(card, () => (onStage = true))}
>
  <span class="frame">
    <Minimap {src} {spot} label="The minimap to find on the map" />
  </span>
  {#if onStage}
    <figcaption>
      <span>Minimap</span>
      <button type="button" class="hide" onclick={() => (hidden = true)}>Hide</button>
    </figcaption>
  {/if}
</figure>

<style>
  .ask {
    font-size: 1.35rem;
    font-weight: 600;
    margin: 0 0 0.75rem;
    overflow-wrap: anywhere;
  }

  :global([data-sheet]) .ask {
    margin: 0 0 0.6rem;
    font-size: max(1rem, 1.2rem * var(--scroll-text, 1));
    line-height: 1.3;
  }

  .chart {
    margin: 0;
  }

  /* As wide as `--most` allows, so the TV and a sheet make it the main thing. */
  .frame {
    --most: 40dvh;
    display: block;
    width: min(100%, var(--most));
    margin-inline: auto;
  }

  /* On the map: a card of its own, beside the sheet or under it. */
  .card {
    position: absolute;
    z-index: 1100;
    top: calc(var(--below, 4rem) + 0.5rem);
    right: 0.9rem;
    width: min(15rem, 45vw);
    padding: 0.5rem 0.5rem 0.3rem;
    background: var(--panel-raised);
    border: var(--border-width) solid var(--line);
    border-radius: var(--radius);
    box-shadow: 0 8px 20px rgb(0 0 0 / 0.5);
    pointer-events: auto;
  }

  .card.away {
    display: none;
  }

  .card .frame {
    --most: 100%;
  }

  @container map-stage (min-width: 52rem) {
    .card {
      top: 1.4rem;
      left: calc(1.4rem + 26rem + 1.5rem);
      right: auto;
      width: min(17rem, 100cqw - 33rem);
    }
  }

  figcaption {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.3rem 0.1rem 0;
    color: var(--muted);
    font-size: 0.75rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .hide,
  .show {
    pointer-events: auto;
    min-height: 2.25rem;
    padding: 0 0.75rem;
    font-size: 0.85rem;
    letter-spacing: normal;
    text-transform: none;
  }

  .show {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    margin-top: 0.5rem;
  }

  .show svg {
    width: 1.1rem;
    height: 1.1rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
  }

  @media (max-width: 1023.98px) {
    .frame {
      --most: 28dvh;
    }
  }
</style>
