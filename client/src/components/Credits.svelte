<script lang="ts">
  /**
   * The credits, as a sheet from the footer: the players whose questions are in the
   * packs, and a thank-you to the OSRS Wiki.
   *
   * Authors are ranked by how many questions carry their name, ties sharing a rank, as a
   * hiscores table would. The server names only those who agreed to be named.
   */
  import { onMount } from 'svelte'

  import { ApiFailure, getCredits, type Author } from '../lib/api'
  import { WIKI_URL } from '../lib/links'
  import Sheet from './Sheet.svelte'
  import SheetHead from './SheetHead.svelte'

  let { onclose }: { onclose: () => void } = $props()

  const id = $props.id()

  let authors = $state<Author[] | null>(null)
  let failure = $state<string | null>(null)

  const ranked = $derived(
    (authors ?? []).map((author, _, all) => ({
      ...author,
      rank: all.findIndex((other) => other.questions === author.questions) + 1,
    })),
  )

  onMount(async () => {
    try {
      authors = (await getCredits()).authors
    } catch (error) {
      failure = error instanceof ApiFailure ? error.message : 'Could not load the question authors.'
    }
  })
</script>

<Sheet labelledby="{id}-title" {onclose}>
  <SheetHead id="{id}-title" {onclose}>Credits</SheetHead>
  <h3>Question authors</h3>
  {#if failure !== null}
    <div class="banner bad">{failure}</div>
  {:else if authors === null}
    <p class="note">Loading the authors…</p>
  {:else if authors.length === 0}
    <p class="note">No player-written questions yet.</p>
  {:else}
    <div class="scroll">
      <table class="authors">
        <thead>
          <tr>
            <th scope="col" class="rank"
              ><span aria-hidden="true">#</span><span class="sr">Rank</span></th
            >
            <th scope="col" class="name">Name</th>
            <th scope="col" class="count">Questions</th>
          </tr>
        </thead>
        <tbody>
          {#each ranked as author (author.name)}
            <tr>
              <td class="rank">{author.rank}</td>
              <td class="name">{author.name}</td>
              <td class="count">{author.questions}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
  <p class="suggest">
    Want your name here?
    <a class="link" href="/suggest" target="_blank" rel="noopener">Suggest one →</a>
  </p>
  <p class="map-credit">
    The world map is rendered from the OSRS game cache using RuneLite's cache library and the
    OpenRS2 archive.
  </p>

  <h3>The OSRS Wiki</h3>
  <p>
    Pretty much every question here was checked against the Old School RuneScape Wiki. The item IDs,
    prices, examine texts, drop tables, transcripts and chatheads all come from years of work by its
    volunteer editors. This game could not exist without them.
  </p>
  <p>Thank you.</p>
  <p>
    Grand Exchange prices are taken from the <a
      class="link"
      href="https://prices.runescape.wiki/"
      target="_blank"
      rel="noopener">real-time prices API</a
    >. Each time the game is built, the prices are obtained through a single <code>/mapping</code>
    and <code>/latest</code> request.
  </p>
  <p>
    Other assets, such as chatheads and item icons, are downloaded once at 1 asset per second,
    stored locally, and served directly by this server. We never hotlink to the wiki.
  </p>
  <p class="note">
    <a class="link" href={WIKI_URL} target="_blank" rel="noopener">oldschool.runescape.wiki</a> · CC BY-NC-SA
  </p>
  <button type="button" class="primary done" onclick={onclose}>Got it</button>
</Sheet>

<style>
  h3 {
    margin: 1rem 0 0.5rem;
    font-size: 1rem;
  }

  :global(.sheet-head) + h3 {
    margin-top: 0;
  }

  /* A long list scrolls on its own, so the wiki's thanks stays a short scroll away. */
  .scroll {
    max-height: min(40dvh, 20rem);
    overflow-y: auto;
    scrollbar-width: thin;
  }

  .authors {
    width: 100%;
    border-collapse: collapse;
    font-variant-numeric: tabular-nums;
  }

  th {
    padding: 0 0.25rem 0.3rem;
    font-weight: normal;
    color: var(--muted);
    border-bottom: 2px solid var(--line);
  }

  td {
    padding: 0.3rem 0.25rem;
    border-top: 1px solid color-mix(in srgb, var(--line) 40%, transparent);
  }

  tbody tr:first-child td {
    border-top: none;
  }

  .rank {
    width: 2.6rem;
    text-align: left;
  }

  .name {
    text-align: left;
    overflow-wrap: anywhere;
  }

  .count {
    width: 6rem;
    text-align: right;
  }

  .suggest {
    margin: 1rem 0 0;
  }

  .done {
    width: 100%;
    margin-top: 1rem;
  }
</style>
