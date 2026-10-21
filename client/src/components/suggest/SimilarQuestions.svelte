<script lang="ts">
  /**
   * The pack questions the one being written looks like, by round and label: a warning,
   * never a reason Send would not work.
   *
   * Asked once the question is whole and has stood still for a moment, and again only when
   * its prompt or answer changes, since the server limits how often an address may ask. A
   * refusal or a lost connection shows nothing.
   */
  import { untrack } from 'svelte'

  import { findSimilar } from '../../lib/api'
  import {
    modeName,
    similarKey,
    type QuestionContent,
    type SimilarMatch,
  } from '../../lib/suggestions'

  let { content }: { content: QuestionContent | undefined } = $props()

  const DEBOUNCE_MS = 800

  const key = $derived(content === undefined ? null : similarKey(content))
  let found = $state<{ key: string; matches: SimilarMatch[] } | null>(null)
  let asked: string | null = null

  $effect(() => {
    const wanted = key
    if (wanted === null || wanted === asked) return
    const sent = untrack(() => content) as QuestionContent
    const timer = setTimeout(() => {
      asked = wanted
      findSimilar(sent).then(
        (matches) => (found = { key: wanted, matches }),
        () => (found = { key: wanted, matches: [] }),
      )
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
  })

  // An answer to an older version of the question is not shown for this one.
  const shown = $derived(found !== null && found.key === key ? found.matches : [])
  const top = $derived(shown[0]?.score)
</script>

<div class="similar" class:shown={top !== undefined} role="status">
  {#if top !== undefined}
    <p><strong>Looks like one we have ({top}%)</strong></p>
    <ul>
      {#each shown as match, index (index)}
        <li>
          <span class="round">{modeName(match.mode)}</span>
          {match.label}
          {#if index > 0}<span class="note">({match.score}%)</span>{/if}
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .similar.shown {
    margin: 1rem 0 0;
    padding: 0.6rem 0.8rem;
    border: var(--border-width) solid var(--line);
    border-left-width: 4px;
    border-radius: min(var(--radius), 8px);
    background: var(--panel);
  }

  p {
    margin: 0;
  }

  ul {
    margin: 0.3rem 0 0;
    padding: 0;
    list-style: none;
  }

  li {
    overflow-wrap: anywhere;
  }

  .round {
    color: var(--muted);
    margin-right: 0.3rem;
  }

  .round::after {
    content: ':';
  }
</style>
