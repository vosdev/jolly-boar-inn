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
   * before the file arrives so nothing jumps. On a map stage the photo leaves the sheet for a
   * card of its own on the map, beside the sheet where there is room and under it where there
   * is not, so the sheet stays small. Hide puts the card away, and Show photo on the sheet brings
   * it back, which frees the map on a phone. Anywhere else, the TV's stage among them, the
   * photo stays on the sheet. A tap on the photo opens it whole in a dialog over the room.
   */
  import { pictureUrl } from '../../../lib/pictures'
  import { toStage } from '../../../lib/stageCard'
  import Typed from '../../stage/Typed.svelte'
  import type { StemProps } from '../props'

  let { data, shown }: StemProps = $props()

  const prompt = $derived(lines(data)[0])
  const src = $derived(pictureUrl(typeof data.picture === 'string' ? data.picture : null))
  const width = $derived(typeof data.width === 'number' ? data.width : 16)
  const height = $derived(typeof data.height === 'number' ? data.height : 9)

  let dialog = $state<HTMLDialogElement | null>(null)
  let onStage = $state(false)
  let hidden = $state(false)
</script>

{#snippet photo()}
  <span class="frame" style:aspect-ratio="{width} / {height}" style:--ratio={width / height}>
    {#if src !== null}
      <img class="shot" {src} alt="" />
    {:else}
      <span class="missing">This photo is missing on this server.</span>
    {/if}
    <span class="camera" aria-hidden="true">
      <span class="corner top left"></span>
      <span class="corner top right"></span>
      <span class="corner bottom left"></span>
      <span class="corner bottom right"></span>
      <span class="cross"></span>
      <span class="label rec">REC</span>
      <span class="label cam">KGP-CAM 03</span>
      <span class="label watch">SURVEILLANCE</span>
    </span>
  </span>
{/snippet}

{#if prompt !== undefined}
  <p class="ask"><Typed line={prompt} shown={shown?.[0]} /></p>
{/if}
{#if onStage && hidden}
  <button type="button" class="show" onclick={() => (hidden = false)}>
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h3l2-2h6l2 2h3v12H4z" /><circle cx="12" cy="13" r="4" />
    </svg>
    Show photo
  </button>
{/if}
<figure
  class="recon"
  class:card={onStage}
  class:away={onStage && hidden}
  {@attach (card) => toStage(card, () => (onStage = true))}
>
  <button
    type="button"
    class="open"
    aria-label="Show the photo full size"
    onclick={() => dialog?.showModal()}
  >
    {@render photo()}
  </button>
  {#if onStage}
    <figcaption>
      <span>Operation Recon · Top secret</span>
      <button type="button" class="hide" onclick={() => (hidden = true)}>Hide</button>
    </figcaption>
  {/if}
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

  /* On the map: a print of its own, a little askew, beside the sheet or under it. */
  .card {
    position: absolute;
    z-index: 1100;
    top: calc(var(--below, 4rem) + 0.5rem);
    left: 0.9rem;
    right: 0.9rem;
    padding: 0.4rem 0.4rem 0.3rem;
    background: var(--panel-raised);
    border: var(--border-width) solid var(--line);
    border-radius: 4px;
    box-shadow: 0 8px 20px rgb(0 0 0 / 0.5);
    transform: rotate(-1.5deg);
  }

  .card.away {
    display: none;
  }

  @container map-stage (min-width: 52rem) {
    .card {
      top: 1.4rem;
      left: calc(1.4rem + 26rem + 1.5rem);
      right: auto;
      width: min(25rem, 100cqw - 33rem);
      transform: rotate(-2deg);
    }
  }

  .card .open {
    border: 0;
    border-radius: 2px;
  }

  .card .frame {
    --most: 30dvh;
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
     camera's marks stay on the photo. A container, so they scale with it. */
  .frame {
    --most: 40dvh;
    position: relative;
    display: block;
    container-type: inline-size;
    width: min(100%, calc(var(--most) * var(--ratio)));
    margin-inline: auto;
    overflow: hidden;
    border-radius: calc(var(--radius) - 2px);
    background: var(--map-void);
  }

  .shot,
  .camera {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }

  .shot {
    object-fit: contain;
  }

  /* An old surveillance camera, drawn in the frame's own units so its marks keep to the corners
     at any size: a green cast, scanlines, a vignette, corner brackets, a crosshair and labels. */
  .camera {
    --cam-ink: rgb(235 240 225 / 0.9);
    --edge: 4cqw;
    --arm: 7cqw;
    pointer-events: none;
    background:
      radial-gradient(ellipse at center, transparent 55%, rgb(0 0 0 / 0.6) 100%),
      repeating-linear-gradient(to bottom, rgb(0 0 0 / 0.2) 0 1px, transparent 1px 3px),
      rgb(70 110 90 / 0.2);
  }

  .corner {
    position: absolute;
    width: var(--arm);
    height: var(--arm);
    border: 0 solid var(--cam-ink);
  }

  .corner.top {
    top: var(--edge);
    border-top-width: max(2px, 0.4cqw);
  }

  .corner.bottom {
    bottom: var(--edge);
    border-bottom-width: max(2px, 0.4cqw);
  }

  .corner.left {
    left: var(--edge);
    border-left-width: max(2px, 0.4cqw);
  }

  .corner.right {
    right: var(--edge);
    border-right-width: max(2px, 0.4cqw);
  }

  .cross {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 4cqw;
    height: 4cqw;
    transform: translate(-50%, -50%);
    background:
      linear-gradient(var(--cam-ink), var(--cam-ink)) center / 100% max(1px, 0.25cqw) no-repeat,
      linear-gradient(var(--cam-ink), var(--cam-ink)) center / max(1px, 0.25cqw) 100% no-repeat;
  }

  .label {
    position: absolute;
    color: var(--cam-ink);
    font:
      700 max(0.5rem, 2.8cqw) / 1 'Courier New',
      monospace;
    letter-spacing: 0.04em;
  }

  .rec {
    top: calc(var(--edge) + 2.2cqw);
    left: calc(var(--edge) + 2.2cqw);
    display: flex;
    align-items: center;
    gap: 1.2cqw;
  }

  .rec::before {
    content: '';
    width: 2.2cqw;
    height: 2.2cqw;
    border-radius: 50%;
    background: rgb(220 40 30);
  }

  .cam {
    top: calc(var(--edge) + 2.2cqw);
    right: calc(var(--edge) + 2.2cqw);
  }

  .watch {
    bottom: calc(var(--edge) + 2.2cqw);
    left: calc(var(--edge) + 2.2cqw);
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
