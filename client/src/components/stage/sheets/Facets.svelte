<script lang="ts">
  /**
   * Flat light and dark planes across a sheet, like the game's own shading. A sheet darkens
   * its dark planes with `--facet-shade` and `--facet-shade-opacity`.
   */
</script>

<svg class="facets" viewBox="0 0 100 60" preserveAspectRatio="none" aria-hidden="true">
  <path class="fl" d="M0 0L18 0L26 22L8 60L0 60Z" />
  <path class="fd" d="M18 0L40 0L34 30L26 22Z" />
  <path class="fl" d="M40 0L63 0L55 26L34 30Z" />
  <path class="fd" d="M26 22L34 30L30 60L8 60Z" />
  <path class="fl" d="M34 30L55 26L60 60L30 60Z" />
  <path class="fd" d="M63 0L84 0L78 34L55 26Z" />
  <path class="fd" d="M55 26L78 34L86 60L60 60Z" />
  <path class="fl" d="M84 0L100 0L100 44L78 34Z" />
  <path class="fd" d="M78 34L100 44L100 60L86 60Z" />
</svg>

<style>
  .facets {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }

  .fl {
    fill: white;
    fill-opacity: var(--scroll-facet-light);
  }

  .fd {
    fill: var(--facet-shade, var(--scroll-edge));
    fill-opacity: var(--facet-shade-opacity, 0.08);
  }
</style>
