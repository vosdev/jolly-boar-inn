<!-- Small glyphs for buttons that say it with a picture. Drawn in the button's own colour.
     The caller names the button with aria-label, so the glyph itself stays hidden. -->
<script lang="ts">
  let { name }: { name: 'trash' | 'trophy' | 'github' } = $props()
</script>

{#if name === 'github'}
  <svg class="icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
    <path
      fill="currentColor"
      d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.06-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"
    />
  </svg>
{:else}
  <svg class="icon line" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    {#if name === 'trash'}
      <path d="M3.5 6h17M9 6V4h6v2M6 6l1 14h10l1-14M10 10v6M14 10v6" />
    {:else}
      <path d="M7 4h10v5a5 5 0 0 1-10 0zM7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3M12 14v4M8 20h8" />
    {/if}
  </svg>
{/if}

<style>
  .icon {
    width: 1.1em;
    height: 1.1em;
    flex: none;
    vertical-align: -0.2em;
  }

  .line {
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
</style>
