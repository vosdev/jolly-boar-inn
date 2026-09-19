<script lang="ts">
  import { createdRooms, normalizeCode } from '../lib/session'

  let { navigate }: { navigate: (to: string) => void } = $props()

  const hosted = createdRooms()
  let code = $state('')

  const target = $derived(normalizeCode(code))

  function join(event: SubmitEvent): void {
    event.preventDefault()
    if (target !== '') navigate(`/r/${target}`)
  }
</script>

<h1>The Jolly Boar Inn</h1>
<p class="tagline">Quiz night. One host, a room code, and everybody's phone.</p>

<section class="panel">
  <h2>Join a room</h2>
  <form onsubmit={join}>
    <div class="field">
      <label for="code">Room code</label>
      <input
        id="code"
        type="text"
        bind:value={code}
        placeholder="DRAGON"
        autocomplete="off"
        autocapitalize="characters"
        spellcheck="false"
      />
    </div>
    <button class="primary" type="submit" disabled={target === ''}>Join</button>
  </form>
</section>

<section class="panel">
  <h2>Host a room</h2>
  <p class="note">
    Pick your name and the settings. You are the host, and you get a room code to read out.
  </p>
  <button type="button" onclick={() => navigate('/create')}>Create a room</button>
</section>

{#if hosted.length > 0}
  <section class="panel">
    <h2>Rooms you created here</h2>
    <ul class="players">
      {#each hosted as room (room)}
        <li>
          <span class="name code-small">{room}</span>
          <button type="button" class="small" onclick={() => navigate(`/r/${room}`)}>Open</button>
        </li>
      {/each}
    </ul>
  </section>
{/if}

<style>
  .code-small {
    font-family: ui-monospace, 'SF Mono', Menlo, monospace;
    letter-spacing: 0.08em;
    font-weight: 600;
  }
</style>
