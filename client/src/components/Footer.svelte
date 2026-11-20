<script lang="ts">
  /**
   * A quiet band under every screen, the top bar's twin: the trademark notice, what is and
   * is not collected, the way to the source, the licence, where the data comes from and how
   * old its prices are, how many questions there are, the credits and the version, which
   * opens what's new.
   *
   * It sits in the page's flow, never fixed, so on a long screen it is below the last
   * answer rather than over it, and on a short one the shell pushes it to the bottom.
   */
  import Credits from './Credits.svelte'
  import Icon from './Icon.svelte'
  import QuestionCounts from './QuestionCounts.svelte'
  import { asOfDate } from '../lib/dates'
  import { DISCORD_URL, LICENSE_URL, REPO_URL, VERSION_LABEL, WIKI_URL } from '../lib/links'
  import { loadPricesAsOf, newestAsOf, pricesAsOf } from '../lib/pricesAsOf.svelte'
  import {
    formatCount,
    loadQuestionCounts,
    questionCounts,
    totalQuestions,
  } from '../lib/questionCounts.svelte'

  let {
    wide = false,
  }: {
    /** The screen above uses the wide page, so the footer's text follows it. */
    wide?: boolean
  } = $props()

  let Changelog = $state<(typeof import('./Changelog.svelte'))['default'] | null>(null)
  let changelogFailed = $state(false)
  let showCredits = $state(false)
  let showCounts = $state(false)

  /** Fetched on every tap until one succeeds, so the 2,000 lines of releases load on demand. */
  async function openChangelog(): Promise<void> {
    changelogFailed = false
    try {
      Changelog = (await import('./Changelog.svelte')).default
    } catch {
      changelogFailed = true
    }
  }

  const asOf = $derived(newestAsOf(pricesAsOf.byMode))

  $effect(() => {
    void loadPricesAsOf()
    void loadQuestionCounts()
  })
</script>

<footer class="footer">
  <div class="inner" class:wide>
    <p>RuneScape and RuneScape Old School are the trademarks of Jagex Limited.</p>
    <p>We only count games and rounds played per day. No cookies, no personal data.</p>
    <ul>
      <li>
        <a class="repo" href={REPO_URL} target="_blank" rel="noopener">
          <Icon name="github" />
          Source on GitHub
        </a>
      </li>
      <li><a href={DISCORD_URL} target="_blank" rel="noopener noreferrer">Discord</a></li>
      <li><a href={LICENSE_URL} target="_blank" rel="noopener">AGPL-3.0</a></li>
      <li>
        <a href={WIKI_URL} target="_blank" rel="noopener">Data from the OSRS Wiki</a> (CC BY-NC-SA)
      </li>
      {#if asOf !== null}<li>GE prices as of {asOfDate(asOf)}</li>{/if}
      {#if questionCounts.counts !== null}
        <li>
          <button type="button" class="plain" onclick={() => (showCounts = true)}
            >{formatCount(totalQuestions(questionCounts.counts))} questions and counting</button
          >
        </li>
      {/if}
      <li>
        <button type="button" class="plain" onclick={() => (showCredits = true)}>Credits</button>
      </li>
      <li>
        <button type="button" class="plain" onclick={() => void openChangelog()}
          >What's new in v{VERSION_LABEL}</button
        >
        {#if changelogFailed}<span>Couldn't load the changelog.</span>{/if}
      </li>
    </ul>
  </div>
</footer>

{#if Changelog !== null}
  <Changelog onclose={() => (Changelog = null)} />
{/if}
{#if showCounts && questionCounts.counts !== null}
  <QuestionCounts counts={questionCounts.counts} onclose={() => (showCounts = false)} />
{/if}
{#if showCredits}
  <Credits onclose={() => (showCredits = false)} />
{/if}

<style>
  /* The bar's edge, drawn the same way: a shadow, mirrored onto the top. */
  .footer {
    background: var(--panel);
    box-shadow: 0 calc(-1 * var(--border-width)) 0 var(--line);
    color: var(--muted);
    font-size: 0.8rem;
    line-height: 1.4;
  }

  /* The screens' column, so the text lines up with the panels above it. */
  .inner.wide {
    width: min(var(--page-wide), 100% - 2rem);
  }

  .inner {
    width: min(var(--page-width), 100% - 2rem);
    margin-inline: auto;
    padding: 1rem 0 1.5rem;
  }

  p {
    margin: 0 0 0.25rem;
  }

  ul {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.25rem 1rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  a,
  .plain {
    color: inherit;
  }

  .plain {
    padding: 0;
    background: none;
    border: none;
    font: inherit;
    text-decoration: underline;
    cursor: pointer;
  }

  .repo {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
  }
</style>
