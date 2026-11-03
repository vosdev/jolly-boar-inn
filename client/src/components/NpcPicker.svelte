<script lang="ts">
  /**
   * Who asks a question: a select of what each NPC asks about, above the row of their faces.
   * The two are one choice, and where the NPC is optional both offer the room's draw first.
   */
  import { tick } from 'svelte'

  import { ASKERS, STRANGER, randomEventFor } from '../lib/randomEvents'
  import NpcFace from './NpcFace.svelte'

  let {
    value = $bindable(),
    asker,
    errors = [],
  }: {
    /** The NPC's id, or '' for the room's draw or for none picked yet. */
    value: string
    /** Whether the room's draw may ask it, or an NPC must be named. */
    asker: 'optional' | 'required'
    /** What is wrong with the pick. */
    errors?: readonly string[]
  } = $props()

  const id = $props.id()
  // A player comes with a topic, not a name, so the select reads by theme, and NPCs sharing
  // one sit together.
  const BY_THEME = [...ASKERS].sort(
    (a, b) => a.theme.localeCompare(b.theme, 'en') || a.name.localeCompare(b.name, 'en'),
  )
  const picked = $derived(
    value !== '' ? randomEventFor(value).name : asker === 'optional' ? 'A random NPC' : '',
  )
  let row: HTMLElement | undefined = $state()

  // The row scrolls sideways, so a question opened on an NPC near its end, or an NPC
  // picked from the select, would be out of sight.
  function showPicked(faces: HTMLElement): void {
    const face = faces.querySelector('input:checked')?.closest<HTMLElement>('.npc')
    if (face) faces.scrollLeft = face.offsetLeft - (faces.clientWidth - face.offsetWidth) / 2
  }

  async function choose(npc: string): Promise<void> {
    value = npc
    await tick()
    if (row) showPicked(row)
  }
</script>

<div class="field">
  <div class="topic">
    <label for="{id}-topic">What's it about?</label>
    <select id="{id}-topic" bind:value={() => value, choose}>
      {#if asker === 'optional'}
        <option value="">Anything (a random NPC)</option>
      {:else}
        <option value="" disabled hidden></option>
      {/if}
      {#each BY_THEME as npc (npc.id)}
        <option value={npc.id}>{npc.theme} ({npc.name})</option>
      {/each}
    </select>
  </div>
  <p class="asker">
    <span id="{id}-npc">Who asks it</span>{#if picked !== ''}<span class="picked"
        >{` · ${picked}`}</span
      >{/if}
  </p>
  <div
    class="npcs"
    role="radiogroup"
    aria-labelledby="{id}-npc"
    bind:this={row}
    {@attach showPicked}
  >
    {#if asker === 'optional'}
      <label class="npc" title="A random NPC">
        <input type="radio" name="{id}-npc" value="" aria-label="A random NPC" bind:group={value} />
        <NpcFace npc={STRANGER} />
      </label>
    {/if}
    {#each ASKERS as npc (npc.id)}
      <label class="npc" title="{npc.name}: {npc.theme}">
        <input
          type="radio"
          name="{id}-npc"
          value={npc.id}
          aria-label={npc.name}
          bind:group={value}
        />
        <NpcFace npc={npc.id} />
      </label>
    {/each}
  </div>
  {#each errors as message (message)}
    <p class="error">{message}</p>
  {/each}
</div>

<style>
  .topic {
    margin-bottom: 0.75rem;
  }

  .asker {
    margin: 0 0 0.3rem;
    font-size: 0.9rem;
    color: var(--muted);
  }

  .picked {
    color: var(--ink);
  }

  /* Sixteen faces do not fit a phone, so they scroll sideways rather than fill the sheet. */
  .npcs {
    position: relative;
    display: flex;
    gap: 0.5rem;
    overflow-x: auto;
    scroll-snap-type: x proximity;
    padding: 2px 2px 0.4rem;
  }

  .npc {
    position: relative;
    flex: none;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    width: 3.6rem;
    height: 3.9rem;
    margin: 0;
    overflow: hidden;
    scroll-snap-align: start;
    background: var(--panel);
    border: var(--border-width) solid var(--line);
    border-radius: min(var(--radius), 8px);
    cursor: pointer;
  }

  .npc:has(:checked) {
    background: color-mix(in srgb, var(--accent) 14%, var(--panel));
    border-color: var(--accent);
    box-shadow: inset 0 0 0 2px var(--accent);
  }

  .npc:has(:focus-visible) {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .npc input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }
</style>
