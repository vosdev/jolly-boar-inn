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
   * A question about a photo: the prompt, then a player's own screenshot of the place, as an
   * agent's recon photo seen through an old surveillance camera.
   *
   * It reads `prompt`, the picture's file and its `width` and `height`, which size the photo
   * before the file arrives so the sheet does not jump. The photo stands on the map's sheet,
   * so it is small; a tap opens it whole in a dialog over the room.
   */
  import overlayUrl from '../../../assets/stage/kgp-recon.svg'
  import { pictureUrl } from '../../../lib/pictures'
  import Typed from '../../stage/Typed.svelte'
  import type { StemProps } from '../props'

  let { data, shown }: StemProps = $props()

  const prompt = $derived(lines(data)[0])
  const src = $derived(pictureUrl(typeof data.picture === 'string' ? data.picture : null))
  const width = $derived(typeof data.width === 'number' ? data.width : 16)
  const height = $derived(typeof data.height === 'number' ? data.height : 9)

  let dialog = $state<HTMLDialogElement | null>(null)
</script>

{#snippet photo()}
  <span class="frame" style:aspect-ratio="{width} / {height}" style:--ratio={width / height}>
    {#if src !== null}
      <img class="shot" {src} alt="" />
    {:else}
      <span class="missing">This photo is missing on this server.</span>
    {/if}
    <img class="overlay" src={overlayUrl} alt="" aria-hidden="true" />
  </span>
{/snippet}

{#if prompt !== undefined}
  <p class="ask"><Typed line={prompt} shown={shown?.[0]} /></p>
{/if}
<figure class="recon">
  <button
    type="button"
    class="open"
    aria-label="Show the photo full size"
    onclick={() => dialog?.showModal()}
  >
    {@render photo()}
  </button>
</figure>

<dialog
  bind:this={dialog}
  class="whole"
  aria-label="The recon photo"
  onclick={(event) => {
    if (event.target === dialog) dialog?.close()
  }}
>
  {@render photo()}
  <form method="dialog">
    <button type="submit">Close</button>
  </form>
</dialog>

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

  .recon {
    margin: 0;
  }

  /* The map's sheet lets taps through to the map; the photo takes its own. */
  .open {
    display: block;
    width: 100%;
    padding: 0;
    border: 2px solid var(--line);
    border-radius: var(--radius);
    background: var(--tile-dark);
    cursor: zoom-in;
    pointer-events: auto;
  }

  /* As wide as the space, unless that makes it taller than `--most`: then narrower, so the
     overlay's marks stay on the photo. */
  .frame {
    --most: 40dvh;
    position: relative;
    display: block;
    width: min(100%, calc(var(--most) * var(--ratio)));
    margin-inline: auto;
    overflow: hidden;
    border-radius: calc(var(--radius) - 2px);
    background: var(--map-void);
  }

  .shot,
  .overlay {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }

  .shot {
    object-fit: contain;
  }

  .overlay {
    pointer-events: none;
  }

  .missing {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    padding: 1rem;
    color: var(--bg-muted);
    font-size: 0.9rem;
  }

  /* The map's sheet lets taps through, and a dialog inherits that from where it is written. */
  .whole {
    pointer-events: auto;
    width: min(96vw, 1600px);
    padding: 0.5rem;
    border: 2px solid var(--line);
    border-radius: var(--radius);
    background: var(--panel);
  }

  .whole::backdrop {
    background: var(--scrim);
  }

  .whole .frame {
    --most: 80dvh;
  }

  .whole form {
    display: flex;
    justify-content: flex-end;
    margin-top: 0.5rem;
  }

  @media (max-width: 1023.98px) {
    .frame {
      --most: 28dvh;
    }
  }
</style>
