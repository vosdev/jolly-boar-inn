<script lang="ts">
  /**
   * The rosette the sheet pins for an answer that scores, in the theme's `--rosette-*` tokens.
   *
   * Inline rather than an `<img>`, which could not read the theme's custom properties
   * (section 13 of ideas/design.md). Every theme pins the same shape, so a player who
   * switches theme still knows what it means; only the Wilderness swaps its star for a skull.
   */
  import type { Pin } from '../../lib/award'

  let { mark }: { mark: Pin } = $props()
</script>

<svg class="rosette" viewBox="0 0 64 100" data-mark={mark} aria-hidden="true">
  <path class="tail-dark" d="M24 38l10 4-6 42-14-4z" />
  <path class="tail" d="M32 42l10-4 10 42-14 4z" />
  <path class="tip" d="M14 80l14 4-2 13-5-6-9 3z" />
  <path class="tip-dark" d="M38 84l14-4 2 14-9-3-5 6z" />
  <path
    class="petal"
    d="M42 30h15l1.6 4.7-3.1 3.9-14.1-5.2zm-2.3 6.4l11.5 9.7-1.8 4.6-4.9 1L37 38.7zm-6 3.4l2.6 14.8L32 57l-4.3-2.4 2.6-14.8zm-6.7-1.1l-7.5 13-4.9-1-1.8-4.6 11.5-9.7zm-4.4-5.3L8.5 38.6l-3.1-3.9L7 30h15zm0-6.8L8.5 21.4l.1-4.9 4.2-2.6 11.5 9.7zm4.4-5.3l-7.5-13 3.3-3.7 4.9.8 2.6 14.8zm6.7-1.1l2.6-14.8 4.9-.8 3.3 3.7-7.5 13zm6 3.4l11.5-9.7 4.2 2.6.1 4.9-14.1 5.2z"
  />
  <path
    class="petal-dark"
    d="M41.4 33.4l14.1 5.2-.1 4.9-4.2 2.6-11.5-9.7zM37 38.7l7.5 13-3.3 3.7-4.9-.8-2.6-14.8zm-6.7 1.1l-2.6 14.8-4.9.8-3.3-3.7 7.5-13zm-6-3.4l-11.5 9.7-4.2-2.6-.1-4.9 14.1-5.2zM22 30H7l-1.6-4.7 3.1-3.9 14.1 5.2zm2.3-6.4L12.8 13.9l1.8-4.6 4.9-1L27 21.3zm6-3.4L27.7 5.4 32 3l4.3 2.4-2.6 14.8zm6.7 1.1l7.5-13 4.9 1 1.8 4.6-11.5 9.7zm4.4 5.3l14.1-5.2 3.1 3.9L57 30H42z"
  />
  {#if mark === 'skull'}
    <circle class="button" cx="32" cy="30" r="13" />
    <path
      class="heart-dark"
      fill-rule="evenodd"
      d="M32 20.5c-5.5 0-8.5 3.8-8.5 8.5 0 2.7 1.1 4.3 3 5.3V38h11v-3.7c1.9-1 3-2.6 3-5.3 0-4.7-3-8.5-8.5-8.5zM26.5 28.5a2.3 2.3 0 1 0 4.6 0a2.3 2.3 0 1 0-4.6 0zM32.9 28.5a2.3 2.3 0 1 0 4.6 0a2.3 2.3 0 1 0-4.6 0z"
    />
  {:else}
    <path
      class="heart"
      d="M32 30h11l-1.5 5.5zm0 0l5.5 9.5-5.5 1.5zm0 0l-5.5 9.5-4-4zm0 0H21l1.5-5.5zm0 0l-5.5-9.5L32 19zm0 0l5.5-9.5 4 4z"
    />
    <path
      class="heart-dark"
      d="M32 30l9.5 5.5-4 4zm0 0v11l-5.5-1.5zm0 0l-9.5 5.5L21 30zm0 0l-9.5-5.5 4-4zm0 0V19l5.5 1.5zm0 0l9.5-5.5 1.5 5.5z"
    />
  {/if}
</svg>

<style>
  .rosette {
    display: block;
    width: 100%;
    height: 100%;
  }

  .petal {
    fill: var(--rosette-petal);
  }

  .petal-dark {
    fill: var(--rosette-petal-dark);
  }

  .tail {
    fill: var(--rosette-tail);
  }

  .tail-dark {
    fill: var(--rosette-tail-dark);
  }

  .tip {
    fill: var(--rosette-tip);
  }

  .tip-dark {
    fill: var(--rosette-tip-dark);
  }

  .heart {
    fill: var(--rosette-heart);
  }

  .heart-dark {
    fill: var(--rosette-heart-dark);
  }

  .button {
    fill: var(--rosette-heart);
    stroke: var(--rosette-heart-dark);
    stroke-width: 2;
  }
</style>
