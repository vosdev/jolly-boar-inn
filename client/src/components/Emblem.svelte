<script lang="ts">
  /**
   * A theme's emblem: its fetched item icon, or the placeholder mark drawn here.
   *
   * The mark is filled with `--accent`, so it takes the accent of whichever `data-theme`
   * it sits under: the page's in the bar, and each theme's own in the menu's list. It fills
   * its parent, which sets the size.
   */
  import { emblemFile, type EmblemId } from '../lib/emblems'

  let { theme }: { theme: EmblemId } = $props()

  const file = $derived(emblemFile(theme))
</script>

{#if file !== null}
  <img class="emblem" src={file} alt="" />
{:else}
  <svg
    class="emblem"
    data-placeholder={theme}
    viewBox="0 0 24 24"
    aria-hidden="true"
    focusable="false"
  >
    {#if theme === 'jolly'}
      <!-- A tankard with its head of foam. -->
      <path
        class="mark"
        fill-rule="evenodd"
        d="M5 8.5h10V19a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2zM7.3 10.5h1.2v8H7.3z"
      />
      <path
        class="mark"
        d="M4.5 8.5V6.8a2.3 2.3 0 0 1 3.6-1.9A2.6 2.6 0 0 1 12.4 4a2.3 2.3 0 0 1 3.1 2.8v1.7z"
      />
      <path class="line" d="M15 11h2.2a1.8 1.8 0 0 1 1.8 1.8v2.4a1.8 1.8 0 0 1-1.8 1.8H15" />
    {:else if theme === 'pollnivneach'}
      <!-- A domed house in the sand, and a palm beside it. -->
      <path
        class="mark"
        fill-rule="evenodd"
        d="M3 20V13h1.2a4.8 4.8 0 0 1 9.6 0H15v7zM7.6 20v-3a1.4 1.4 0 0 1 2.8 0v3z"
      />
      <path class="mark" d="M8.5 8.4V6.6h1v1.8z" />
      <path class="line" d="M18 20c.4-3.4.6-6.5.5-9.8" />
      <path
        class="mark"
        d="M18.5 10.2c-1-2.2-3.2-3-5-2.2 1.8.3 3.4 1 5 2.2zM18.5 10.2c1-2.2 3.2-3 5-2.2-1.8.3-3.4 1-5 2.2zM18.5 10.2c-.6-2.4.4-4.4 1.9-5.4-.8 1.8-1.3 3.5-1.9 5.4zM18.5 10.2c-2 .2-3.6 1.5-4.2 3.3 1.2-1.4 2.6-2.4 4.2-3.3zM18.5 10.2c2 .2 3.6 1.5 4.2 3.3-1.2-1.4-2.6-2.4-4.2-3.3z"
      />
      <path class="mark" d="M1.5 20h21v1.5h-21z" />
    {:else if theme === 'party_room'}
      <!-- A partyhat, points and band. -->
      <path class="mark" fill-rule="evenodd" d="M3 18.5V8l4.5 4.5L12 5l4.5 7.5L21 8v10.5z" />
      <path class="mark" d="M3 19.5h18V21H3z" />
    {:else if theme === 'tzhaar'}
      <!-- The volcano, smoking, with lava down its side. -->
      <path
        class="mark"
        fill-rule="evenodd"
        d="M1.5 21 8.4 9.5h2.3l1.3 1.6 1.3-1.6h2.3L22.5 21zM12 12.2l1.3 2.6-1 1.4 1.5 3-2.3-2.8 1-1.5z"
      />
      <path
        class="mark"
        d="M9.8 7.3a1.6 1.6 0 1 0 3.2 0 1.6 1.6 0 1 0-3.2 0zM12.6 5a2 2 0 1 0 4 0 2 2 0 1 0-4 0zM16.4 2.6a1.3 1.3 0 1 0 2.6 0 1.3 1.3 0 1 0-2.6 0z"
      />
    {:else if theme === 'jungle'}
      <!-- A banana, stalk up. -->
      <path class="mark" d="M5 5.2C5 13.4 10.6 19 19.6 19l1.1-1.9C13.2 16.9 8.7 12.3 7.7 5.2z" />
      <path class="mark" d="M4.3 2.6h2.8l.5 2.6H4.5z" />
    {:else if theme === 'prifddinas'}
      <!-- Three crystal shards on a ledge. -->
      <path
        class="mark"
        d="M12 2l3.2 5.5L14 19.5h-4L8.8 7.5zM5.4 9l2.2 3-.9 7.5H4.4L3.6 12zM18.6 9l1.8 3-.8 7.5h-2.3l-.9-7.5z"
      />
      <path class="mark" d="M2.5 20.5h19V22h-19z" />
    {:else if theme === 'morytania'}
      <!-- The ectophial: a stoppered flask, round below. -->
      <path
        class="mark"
        fill-rule="evenodd"
        d="M9.8 2h4.4v2.2h-.8v4.3a6.4 6.4 0 1 1-2.8 0V4.2h-.8zM8 15a4 4 0 0 0 8 0z"
      />
    {:else}
      <!-- A skull, which is all the Wilderness has to say. -->
      <path
        class="mark"
        fill-rule="evenodd"
        d="M12 2.5a8 8 0 0 0-8 8c0 2.6 1.2 4.6 3 5.8V20a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-3.7c1.8-1.2 3-3.2 3-5.8a8 8 0 0 0-8-8zM6.5 11a2.3 2.3 0 1 0 4.6 0 2.3 2.3 0 1 0-4.6 0zM12.9 11a2.3 2.3 0 1 0 4.6 0 2.3 2.3 0 1 0-4.6 0zM12 13.9l1.3 2.4h-2.6zM10.3 18.4h1v2.6h-1zM12.7 18.4h1v2.6h-1z"
      />
    {/if}
  </svg>
{/if}

<style>
  .emblem {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  /* The icons are game sprites of about 32px: kept at their own size, a pixel to a pixel,
     since blurring them up or down loses what they are. */
  img.emblem {
    object-fit: scale-down;
    image-rendering: pixelated;
  }

  .mark {
    fill: var(--accent);
  }

  .line {
    fill: none;
    stroke: var(--accent);
    stroke-width: 1.8;
    stroke-linecap: round;
  }
</style>
