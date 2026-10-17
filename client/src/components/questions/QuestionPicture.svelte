<script lang="ts">
  /**
   * A pack question's picture, under its stem on the scroll, open and on the reveal alike.
   *
   * The box has its full height before the file arrives, so nothing on the sheet moves when
   * it loads. A render smaller than the box stays its own size: scaled up it would blur.
   * The alt is empty because the prompt names what is pictured, and the file's name says
   * nothing a screen reader could use.
   */
  import { pictureUrl } from '../../lib/pictures'

  let { name }: { name: string | null | undefined } = $props()

  const src = $derived(pictureUrl(name))
</script>

{#if src !== null}
  <div class="picture">
    <img {src} alt="" />
  </div>
{/if}

<style>
  .picture {
    display: flex;
    align-items: center;
    justify-content: center;
    height: calc(5rem * var(--scroll-scale, 1));
    margin: 0.5rem 0 0;
  }

  img {
    max-width: 100%;
    max-height: 100%;
  }
</style>
