<script lang="ts">
  /**
   * What's new, as a sheet opened from the footer's version: each minor with its date and
   * a line or two, its patches nested beneath as one-liners, newest first.
   */
  import { CHANGELOG, groupByMinor, type ChangelogEntry } from '../lib/changelog'
  import { asOfDate } from '../lib/dates'
  import { RELEASES_URL, versionLabel } from '../lib/links'
  import Sheet from './Sheet.svelte'

  let { onclose }: { onclose: () => void } = $props()

  const id = $props.id()
  const groups = groupByMinor(CHANGELOG)
</script>

{#snippet head(entry: ChangelogEntry)}
  <span class="version">{versionLabel(entry.version)}</span>
  <time datetime={entry.date}>{asOfDate(entry.date)}</time>
{/snippet}

<Sheet labelledby="{id}-title" {onclose}>
  <h2 id="{id}-title">What's new</h2>
  <ol class="groups">
    {#each groups as group (group.key)}
      <li>
        {#if group.minor !== null}
          <p class="head">{@render head(group.minor)}</p>
          <p class="text">{group.minor.text}</p>
        {/if}
        {#if group.patches.length > 0}
          <ol class="patches">
            {#each group.patches as patch (patch.version)}
              <li>
                <p class="head">{@render head(patch)}</p>
                <p class="text">{patch.text}</p>
              </li>
            {/each}
          </ol>
        {/if}
      </li>
    {/each}
  </ol>
  <p class="all">
    <a class="link" href={RELEASES_URL} target="_blank" rel="noopener">All releases on GitHub</a>
  </p>
  <button type="button" class="primary done" onclick={onclose}>Got it</button>
</Sheet>

<style>
  h2 {
    margin: 0 0 0.75rem;
    font-size: 1.25rem;
  }

  ol {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* The list scrolls on its own, so focus landing on the buttons below it still shows the
     newest versions first. */
  .groups {
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
    max-height: min(60dvh, 32rem);
    overflow-y: auto;
    scrollbar-width: thin;
  }

  .patches {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    margin-top: 0.4rem;
    padding-left: 0.85rem;
    border-left: 2px solid var(--line);
  }

  p {
    margin: 0;
  }

  .head {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
  }

  .version {
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  time {
    color: var(--muted);
    font-size: 0.85rem;
  }

  .patches .text {
    font-size: 0.9rem;
  }

  .all {
    margin-top: 1rem;
  }

  .done {
    width: 100%;
    margin-top: 1rem;
  }
</style>
