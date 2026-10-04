<script lang="ts">
  /**
   * `/suggest`: a question, an examine line or an item for the packs, sent to the
   * operator's queue (`lib/suggestions.ts`).
   *
   * Only for a browser that has finished a game, as Home's link is. Before any field the
   * page asks the server how many suggestions this address has left this hour, so a
   * player at the limit is told before writing a question rather than after. Built for a
   * computer: writing a question is desk work, not something done at the pub table.
   */
  import { onMount } from 'svelte'

  import SuggestionEditor from '../components/suggest/SuggestionEditor.svelte'
  import { ApiFailure, getSuggestionAllowance, sendSuggestion } from '../lib/api'
  import { npcArt } from '../lib/npcs'
  import {
    CHOICES,
    maySuggest,
    retryIn,
    type Choice,
    type SuggestionBody,
  } from '../lib/suggestions'

  let { navigate }: { navigate: (to: string) => void } = $props()

  const allowed = maySuggest()
  let view = $state<'checking' | 'pick' | 'write' | 'sending' | 'sent' | 'limited'>('checking')
  let choice = $state<Choice | null>(null)
  let retryAt = $state<string | null>(null)
  let failure = $state<string | null>(null)
  /** Remounts the editor for a fresh form after "Suggest another". */
  let round = $state(0)

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
    void checkAllowance().then((ok) => {
      if (ok) view = 'pick'
    })
  })

  function pick(next: Choice): void {
    choice = next
    failure = null
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
    <p class="note">Checking with the innkeeper…</p>
  </section>
{:else if view === 'limited'}
  <section class="panel">
    <h1>Suggest a question</h1>
    <p>
      That's as many as the innkeeper reads from one connection in an hour. Try again
      {retryIn(retryAt, Date.now())}.
    </p>
    <button type="button" onclick={() => navigate('/')}>Home</button>
  </section>
{:else if view === 'sent'}
  <section class="panel">
    <h1>Thanks, it's on the innkeeper's desk</h1>
    <p>
      The innkeeper reads every suggestion. An approved one joins the game in a later
      update. There's no account, so you won't hear back: watch for it in a game.
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
      Everything here is written by players and read by the innkeeper before anyone plays
      it.
    </p>
  </section>
  {#if failure !== null}
    <div class="banner bad" role="alert">{failure}</div>
  {/if}
  {#if choice === null}
    <section class="panel">
      <h2>What would you like to suggest?</h2>
      <ul class="choices">
        {#each CHOICES as option (option.id)}
          {@const art = npcArt(option.host)}
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
    <section class="panel">
      <p class="back">
        <button type="button" class="link" onclick={() => (choice = null)}>
          ← Everything you can suggest
        </button>
      </p>
      {#key round}
        <SuggestionEditor
          {choice}
          saveLabel={view === 'sending' ? 'Sending…' : 'Send to the innkeeper'}
          onsave={(body) => void send(body)}
          oncancel={() => (choice = null)}
        />
      {/key}
    </section>
  {/if}
{/if}

<style>
  h1 {
    margin-top: 0;
  }

  .choices {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
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
</style>
