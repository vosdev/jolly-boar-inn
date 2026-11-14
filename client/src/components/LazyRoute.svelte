<script lang="ts" generics="Module">
  /**
   * A screen fetched on demand, with a way back when the fetch fails.
   *
   * The chunk reload in `lib/version.ts` runs once per build, so a second miss, or a tab gone
   * offline, lands here. A retry fetches again. Some browsers keep a failed import's error,
   * so a retry that fails too offers a reload, which starts from a fresh module map.
   */
  import type { Snippet } from 'svelte'

  let {
    load,
    reload = () => location.reload(),
    children,
  }: {
    /** The `import()` of the screen's module. */
    load: () => Promise<Module>
    /** Called by the button a failed retry offers. */
    reload?: () => void
    /** The screen, drawn from the loaded module. */
    children: Snippet<[Module]>
  } = $props()

  // svelte-ignore state_referenced_locally
  let pending = $state(load())
  let retried = $state(false)

  function retry(): void {
    retried = true
    pending = load()
  }
</script>

{#await pending}
  <p class="note">Loading…</p>
{:then module}
  {@render children(module)}
{:catch}
  <section class="panel">
    <p>This page didn't load. Check your connection and try again.</p>
    {#if retried}
      <button type="button" onclick={reload}>Reload page</button>
    {:else}
      <button type="button" onclick={retry}>Try again</button>
    {/if}
  </section>
{/await}
