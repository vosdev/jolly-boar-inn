<script lang="ts">
  /**
   * The last look on a phone before the room is made: its code, which a room-word code is
   * too long to show in a phone's header, a reroll for it, and the game in one line. A
   * desktop shows the code in Create's header instead and creates straight away.
   *
   * It stays up while the room is being made, and a refusal shows here, where the
   * reroll a taken code needs is.
   */
  import { hostOf } from '../lib/modes'
  import { npcArt } from '../lib/npcs'
  import Sheet from './Sheet.svelte'

  let {
    code,
    modes,
    surprise,
    questions,
    details,
    busy,
    held = false,
    failure,
    onreroll,
    onconfirm,
    oncancel,
  }: {
    /** The code the room will get, or null when the server will draw one. */
    code: string | null
    /** The rounds' modes, faces shown in order; empty for a surprise. */
    modes: string[]
    /** How many surprise rounds, or null when the host picked them. */
    surprise: number | null
    questions: number
    /** Pace and events, already in words. */
    details: string
    busy: boolean
    /** Rerolled too often: the reroll waits until the server takes one again. */
    held?: boolean
    failure: string | null
    onreroll: () => void
    onconfirm: () => void
    oncancel: () => void
  } = $props()

  const id = $props.id()
  const rounds = $derived(surprise ?? modes.length)
</script>

<Sheet labelledby="{id}-title" onclose={oncancel}>
  <h2 id="{id}-title">Open the doors?</h2>
  <p class="note">Your room keeps for 48 hours. Its settings are final once it's open.</p>

  {#if code !== null}
    <p class="label" id="{id}-code">Room code</p>
    <div class="codebox" aria-labelledby="{id}-code" role="group">
      <b>{code}</b>
      <button type="button" class="reroll" onclick={onreroll} disabled={busy || held}>
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M20 11a8 8 0 1 0-2.3 5.7" /><path d="M20 4v7h-7" />
        </svg>
        Reroll
      </button>
    </div>
    <p class="note">Players type this to join. You can share a link from the lobby too.</p>
  {/if}

  <div class="game">
    {#if modes.length > 0}
      <span class="faces" aria-hidden="true">
        {#each modes as mode (mode)}
          {@const art = npcArt(hostOf(mode).host.id)}
          <img class={art.cut} src={art.url} alt="" />
        {/each}
      </span>
    {/if}
    <p>
      <b
        >{rounds}{surprise === null ? '' : ' surprise'} round{rounds === 1 ? '' : 's'} · {questions} questions</b
      ><br />
      <span class="note">{details}</span>
    </p>
  </div>

  {#if failure !== null}
    <p class="banner bad">{failure}</p>
  {/if}

  <div class="row buttons">
    <button type="button" onclick={oncancel} disabled={busy}>Not yet</button>
    <button type="button" class="primary" onclick={onconfirm} disabled={busy}>
      {busy ? 'Creating…' : 'Create room'}
    </button>
  </div>
</Sheet>

<style>
  h2 {
    margin: 0;
    font-size: 1.25rem;
  }

  .note {
    margin: 0.3rem 0 0;
  }

  .label {
    margin: 1rem 0 0.35rem;
    font-weight: 700;
    font-size: 0.85rem;
    color: var(--muted);
  }

  .codebox {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: calc(0.55rem - var(--border-give)) calc(0.5rem - var(--border-give))
      calc(0.55rem - var(--border-give)) calc(0.85rem - var(--border-give));
    background: var(--panel-raised);
    border: var(--border-width) solid var(--line);
    border-radius: min(var(--radius), 8px);
  }

  .codebox b {
    flex: 1;
    min-width: 0;
    font-family: var(--font-display);
    font-size: 1.35rem;
    line-height: 1.2;
    overflow-wrap: break-word;
  }

  .reroll {
    flex: none;
    display: flex;
    align-items: center;
    gap: 0.35rem;
    min-height: 44px;
  }

  .reroll svg {
    fill: none;
    stroke: currentColor;
    stroke-width: 2.2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .game {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-top: 1rem;
    padding-top: 0.75rem;
    border-top: 1px solid var(--line);
  }

  .game p {
    margin: 0;
    line-height: 1.35;
  }

  .faces {
    display: flex;
    flex: none;
    gap: 2px;
  }

  .faces img {
    display: block;
    height: 2.1rem;
  }

  .faces .render {
    width: 2.1rem;
    object-fit: cover;
    object-position: top;
    transform: scaleX(-1);
  }

  .banner {
    margin: 1rem 0 0;
  }

  .buttons {
    margin-top: 1rem;
    flex-wrap: nowrap;
  }

  .buttons button {
    min-height: 48px;
  }

  .buttons .primary {
    flex: 1;
  }
</style>
