<script lang="ts">
  /**
   * `/credits`: the players whose questions are in the packs, and a thank-you to the OSRS
   * Wiki, linked from the footer.
   *
   * Authors are ranked by how many questions carry their name, ties sharing a rank, as a
   * hiscores table would. The server names only those who agreed to be named.
   */
  import { onMount } from 'svelte'

  import { ApiFailure, getCredits, type Author } from '../lib/api'
  import { WIKI_URL } from '../lib/links'

  let { navigate }: { navigate: (to: string) => void } = $props()

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
      failure = error instanceof ApiFailure ? error.message : 'the authors did not load'
    }
  })
</script>

<section class="panel">
  <h1>Credits</h1>
  <h2>Question authors</h2>
  {#if failure !== null}
    <div class="banner bad" role="alert">{failure}</div>
  {:else if authors === null}
    <p class="note">Loading the authors…</p>
  {:else if authors.length === 0}
    <p class="note">No player-written questions yet.</p>
  {:else}
    <table class="authors">
      <thead>
        <tr>
          <th scope="col" class="rank"><span aria-hidden="true">#</span><span class="sr">Rank</span></th>
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
  {/if}
  <p class="suggest">
    Want your name here?
    <button type="button" class="link" onclick={() => navigate('/suggest')}>Suggest one →</button>
  </p>
</section>

<section class="panel">
  <h2>The OSRS Wiki</h2>
  <p>
    Pretty much every question here was checked against the Old School RuneScape Wiki. The item IDs,
    prices, examine texts, drop tables, transcripts and chatheads all come from years of work by
    its volunteer editors. This game could not exist without them.
  </p>
  <p>
    Thank you.
  </p>
  <p>
    Grand Exchange prices are taken from the <a class="link" href="https://prices.runescape.wiki/" target="_blank" rel="noopener">real-time prices API</a>. Each time the game is built, the prices are obtained through a single <code>/mapping</code> and <code>/latest</code> request.
  </p>
  <p>
    Other assets, such as chatheads and pictures, are a one-time download from the wiki at a rate of 1 asset per second; stored locally and served from this game server. The game does not hotlink to the wiki.
  </p>
  <p class="note">
    <a class="link" href={WIKI_URL} target="_blank" rel="noopener">oldschool.runescape.wiki</a> · CC BY-NC-SA
  </p>
</section>

<style>
  h1 {
    margin-top: 0;
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
</style>
