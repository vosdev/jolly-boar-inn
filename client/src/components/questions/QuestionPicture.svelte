<script lang="ts">
  /**
   * A pack question's picture, under its stem on the scroll, open and on the reveal alike.
   *
   * The box has its full height before the file arrives, so nothing on the sheet moves when
   * it loads. A render smaller than the box stays its own size: scaled up it would blur.
   * The alt is empty because the prompt names what is pictured, and the file's name says
   * nothing a screen reader could use.
   *
   * `shadow` draws the render's outline filled with the theme's flat `--silhouette`, over
   * the image held invisible so the fill is exactly its size. `lifted` fades the shadow
   * into the render, as the reveal does. It is an animation, not a transition, because the
   * reveal draws a new picture that is lifted from its first frame. `caption` is the name
   * under it.
   *
   * A `large` picture on a room's stage (the nearest `[data-fit-stage]`) takes the height the
   * stage has left once everything else is in, between `PICTURE_LEAST` and the render's own
   * height, and the caption's room is kept from the start so the reveal does not move it.
   * The height is measured while the question is open and held from the reveal on, so the
   * silhouette and the render share one box and a taller reveal scrolls rather than shrinks it.
   */
  import { pictureHeight } from '../../lib/pictureFit'
  import { pictureUrl } from '../../lib/pictures'

  let {
    name,
    shadow = false,
    lifted = false,
    large = false,
    caption = null,
  }: {
    name: string | null | undefined
    shadow?: boolean
    lifted?: boolean
    /** The picture is the whole question, so it gets the room a prompt would have had. */
    large?: boolean
    caption?: string | null
  } = $props()

  const src = $derived(pictureUrl(name))

  let box = $state<HTMLElement | null>(null)
  let img = $state<HTMLImageElement | null>(null)
  let natural = $state(0)
  let fitted = $state<number | null>(null)

  function loaded(): void {
    natural = img?.naturalHeight ?? 0
  }

  $effect(() => {
    if (img?.complete) natural = img.naturalHeight
  })

  $effect(() => {
    const mine = box
    const stage = mine?.closest<HTMLElement>('[data-fit-stage]') ?? null
    const content = stage?.firstElementChild
    if (!large || lifted || !mine || !stage || !(content instanceof HTMLElement) || natural <= 0) {
      return
    }
    const measure = (): void => {
      const rest = content.offsetHeight - mine.offsetHeight
      fitted = pictureHeight(stage.clientHeight - rest, natural)
    }
    measure()
    const watch = new ResizeObserver(measure)
    watch.observe(stage)
    watch.observe(content)
    return () => watch.disconnect()
  })
</script>

{#if src !== null}
  <div
    class="picture"
    class:large
    bind:this={box}
    style:--picture-height={fitted === null ? null : `${fitted}px`}
  >
    <div class="frame" class:shadow class:lifted={shadow && lifted}>
      <img {src} alt="" bind:this={img} onload={loaded} />
      {#if shadow}
        <span class="fill" style:--outline="url('{src}')"></span>
      {/if}
    </div>
  </div>
  {#if caption}
    <p class="caption">{caption}</p>
  {:else if large}
    <p class="reserve" aria-hidden="true">&nbsp;</p>
  {/if}
{/if}

<style>
  .picture {
    --picture-height: calc(5rem * var(--scroll-scale, 1));
    display: flex;
    align-items: center;
    justify-content: center;
    height: var(--picture-height);
    margin: 0.5rem 0 0;
  }

  .large {
    --picture-height: calc(12rem * var(--scroll-scale, 1));
  }

  .frame {
    position: relative;
    display: flex;
    max-width: 100%;
  }

  img {
    max-width: 100%;
    max-height: var(--picture-height);
  }

  .shadow img {
    opacity: 0;
  }

  .fill {
    position: absolute;
    inset: 0;
    background: var(--silhouette);
    -webkit-mask: var(--outline) center / 100% 100% no-repeat;
    mask: var(--outline) center / 100% 100% no-repeat;
  }

  .lifted img {
    opacity: 1;
    animation: appear 700ms ease;
  }

  .lifted .fill {
    opacity: 0;
    animation: vanish 700ms ease;
  }

  @keyframes appear {
    from {
      opacity: 0;
    }
  }

  @keyframes vanish {
    from {
      opacity: 1;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .lifted img,
    .lifted .fill {
      animation: none;
    }
  }

  .caption,
  .reserve {
    margin: 0.25rem 0 0;
    text-align: center;
    font-family: var(--font-display);
    font-size: 1.25em;
    font-weight: 700;
    color: var(--scroll-ink);
  }

  .reserve {
    visibility: hidden;
  }
</style>
