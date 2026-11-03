<script lang="ts">
  /**
   * `/suggest`: a question, an examine line or an item for the packs, sent to the
   * operator's queue (`lib/suggestions.ts`).
   *
   * Only for a browser that has finished a game, as Home's link is. Before any field the
   * page asks the server how many suggestions this address has left this hour, so a
   * player at the limit is told before writing a question rather than after. Built for a
   * computer: writing a question is desk work, not something done at the pub table. So the
   * pack's questions for the card stand open beside the editor there, and wait folded up
   * under it on a phone. A place on the map is offered only once this server's map has loaded.
   */
  import { onMount } from 'svelte'
  import { hero, heroes } from 'virtual:branding'

  import ExistingQuestions from '../components/suggest/ExistingQuestions.svelte'
  import SuggestionEditor from '../components/suggest/SuggestionEditor.svelte'
  import { ApiFailure, getSuggestionAllowance, sendSuggestion } from '../lib/api'
  import { tilesLoad } from '../lib/map'
  import { HOUSE } from '../lib/modes'
  import { npcArt } from '../lib/npcs'
  import {
    CHOICES,
    existingMode,
    maySuggest,
    retryIn,
    type Choice,
    type SuggestionBody,
  } from '../lib/suggestions'
  import { routeIn, routeOut } from '../lib/routeFade'
  import { watchTheme } from '../lib/theme'

  let { navigate }: { navigate: (to: string) => void } = $props()

  const allowed = maySuggest()
  // The card for the inn's own host shows the selfhoster's hero, as Home does, else the boar.
  let theme = $state('')
  const heroArt = $derived(heroes[theme] ?? hero)
  onMount(() => watchTheme((current) => (theme = current)))
  let view = $state<'checking' | 'pick' | 'write' | 'sending' | 'sent' | 'limited'>('checking')
  let choice = $state<Choice | null>(null)
  let retryAt = $state<string | null>(null)
  let failure = $state<string | null>(null)
  /** Remounts the editor for a fresh form after "Suggest another". */
  let round = $state(0)
  /** Who asks the random event being written, so the list starts with theirs. */
  let asker = $state('')
  /** The shadows' labels in Who's That NPC?: the NPCs on the list, already asked about. */
  let asked = $state<readonly string[]>([])
  let mapped = $state(false)
  const offered = $derived(CHOICES.filter((option) => mapped || option.map !== true))
  const existing = $derived(choice === null ? null : existingMode(choice))
  /** Whether the list starts open: beside the editor, at the width `.writing` sets it there. */
  let beside = $state(false)

  async function checkAllowance(): Promise<boolean> {
    try {
      const allowance = await getSuggestionAllowance()
      if (allowance.left > 0) return true
      retryAt = allowance.retry_at
      view = 'limited'
      return false
    } catch {
      // The send will say so if it really is over; a failed check is no reason to stop.
      return true
    }
  }

  onMount(() => {
    if (!allowed) return
    void tilesLoad().then((found) => (mapped = found))
    void checkAllowance().then((ok) => {
      if (ok) view = 'pick'
    })
  })

  function pick(next: Choice): void {
    choice = next
    asked = []
    failure = null
    beside = typeof matchMedia === 'function' && matchMedia('(min-width: 70rem)').matches
    view = 'write'
  }

  async function send(body: SuggestionBody): Promise<void> {
    if (view === 'sending') return
    view = 'sending'
    failure = null
    try {
      await sendSuggestion(body)
      view = 'sent'
    } catch (error) {
      if (error instanceof ApiFailure && error.status === 429) {
        await checkAllowance()
        view = 'limited'
        return
      }
      failure = error instanceof ApiFailure ? error.message : 'the suggestion was not sent'
      view = 'write'
    }
  }

  async function another(): Promise<void> {
    choice = null
    round += 1
    if (await checkAllowance()) view = 'pick'
  }
</script>

{#if !allowed}
  <section class="panel">
    <h1>Suggest a question</h1>
    <p>Play a game first. Once you have, come back here with your questions.</p>
    <button type="button" onclick={() => navigate('/')}>Home</button>
  </section>
{:else if view === 'checking'}
  <section class="panel">
    <h1>Suggest a question</h1>
    <p class="note">Checking with Reldo…</p>
  </section>
{:else if view === 'limited'}
  <section class="panel">
    <h1>Suggest a question</h1>
    <p>
      That's as many as Reldo reads from one connection in an hour. Try again
      {retryIn(retryAt, Date.now())}.
    </p>
    <button type="button" onclick={() => navigate('/')}>Home</button>
  </section>
{:else if view === 'sent'}
  <section class="panel">
    <h1>Thanks, it's on Reldo's desk</h1>
    <p>
      Reldo reads every suggestion. An approved one joins the game in a later update. There's no
      account, so you won't hear back: watch for it in a game.
    </p>
    <div class="row">
      <button type="button" class="primary" onclick={() => void another()}>Suggest another</button>
      <button type="button" onclick={() => navigate('/')}>Home</button>
    </div>
  </section>
{:else}
  <section class="panel">
    <h1>Suggest a question</h1>
    <p class="note">
      Everything here is written by players and read by Reldo before anyone plays it.
    </p>
  </section>
  {#if failure !== null}
    <div class="banner bad">{failure}</div>
  {/if}
  <div class="swap">
    {#if choice === null}
      <section class="panel" in:routeIn out:routeOut>
        <h2>What would you like to suggest?</h2>
        <ul class="choices">
          {#each offered as option (option.id)}
            {@const art =
              option.host === HOUSE.id && heroArt !== null
                ? { url: heroArt, cut: 'hero' }
                : npcArt(option.host)}
            <li>
              <button type="button" class="choice" onclick={() => pick(option)}>
                <img src={art.url} alt="" class={art.cut} />
                <span>
                  <strong>{option.label}</strong>
                  <span class="note">{option.hint}</span>
                </span>
              </button>
            </li>
          {/each}
        </ul>
      </section>
    {:else}
      <div class="writing" class:aside={existing !== null} in:routeIn out:routeOut>
        <section class="panel">
          <p class="back">
            <button type="button" class="link" onclick={() => (choice = null)}>
              ← Everything you can suggest
            </button>
          </p>
          {#key round}
            <SuggestionEditor
              {choice}
              {asked}
              hero={heroArt}
              saveLabel={view === 'sending' ? 'Sending…' : 'Send to Reldo'}
              onnpc={(npc) => (asker = npc)}
              onsave={(body) => void send(body)}
              oncancel={() => (choice = null)}
            />
          {/key}
        </section>
        {#if existing !== null}
          <ExistingQuestions
            mode={existing}
            npc={asker}
            open={beside}
            onloaded={(rows) =>
              (asked = rows.filter((row) => row.npc !== undefined).map((row) => row.label))}
          />
        {/if}
      </div>
    {/if}
  </div>
{/if}

<style>
  .swap {
    display: grid;
  }

  .swap > :global(*) {
    grid-area: 1 / 1;
    min-width: 0;
  }

  h1 {
    margin-top: 0;
  }

  .choices {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    /* As many columns as keep a card's hint readable: one on a phone, three on a computer. */
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 15rem), 1fr));
    gap: 0.75rem;
  }

  .choice {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    width: 100%;
    height: 100%;
    text-align: left;
    background: var(--panel-raised);
  }

  .choice img {
    flex: none;
    width: 48px;
    height: 48px;
    object-fit: contain;
    image-rendering: pixelated;
  }

  /* Hosts face the scroll from its left; a render faces the other way (lib/npcs.ts). */
  .choice img.render {
    transform: scaleX(-1);
    object-fit: cover;
    object-position: top;
  }

  .choice strong {
    display: block;
  }

  .back {
    margin: 0 0 0.75rem;
  }

  .writing {
    display: grid;
    gap: 1rem;
    align-items: start;
  }

  /* Beside the list the editor would be too narrow for its preview, so writing takes more
     than the page's width, centred on it. */
  @media (min-width: 70rem) {
    .writing.aside {
      --writing: min(86rem, 100vw - 3rem);
      grid-template-columns: minmax(0, 1fr) 20rem;
      width: var(--writing);
      margin-inline: calc((100% - var(--writing)) / 2);
    }

    .writing.aside > :global(.existing) {
      position: sticky;
      top: 1rem;
    }
  }
</style>
