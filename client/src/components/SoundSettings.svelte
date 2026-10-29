<script lang="ts">
  /**
   * The menu's Sound section (section 7 of ideas/design.md): two switches, because muting
   * the audio a question is made of is not the same as muting the decoration, and only a
   * separate switch can warn about it. In a TV room the TV plays for everyone, so the
   * phone's switches start off and say why; on the TV they are fixed on.
   */
  import { sound, source, toggleSound } from '../lib/audio'
</script>

<section aria-labelledby="menu-sound">
  <h2 class="section-title" id="menu-sound">Sound</h2>
  <div class="switches">
    <button
      type="button"
      class="switch"
      aria-pressed={$sound.effects}
      disabled={$source === 'tv'}
      onclick={() => toggleSound('effects')}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path
          d="M9 17.5V5.5l10-2v12"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linejoin="round"
        />
        <circle cx="6.5" cy="17.5" r="2.5" fill="currentColor" />
        <circle cx="16.5" cy="15.5" r="2.5" fill="currentColor" />
        <path class="strike" d="M4 4l16 16" stroke="currentColor" stroke-width="1.8" />
      </svg>
      Music & effects
    </button>
    <button
      type="button"
      class="switch"
      aria-pressed={$sound.question}
      aria-describedby={!$sound.question && $source === 'stored' ? 'sound-warning' : undefined}
      disabled={$source === 'tv'}
      onclick={() => toggleSound('question')}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path
          d="M4 9h4l5-4v14l-5-4H4z"
          fill="currentColor"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linejoin="round"
        />
        <path
          d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
        />
        <path class="strike" d="M4 4l16 16" stroke="currentColor" stroke-width="1.8" />
      </svg>
      Question audio
    </button>
  </div>
  {#if $source === 'tv'}
    <p class="note">The TV always plays sound.</p>
  {:else if $source === 'tv_room'}
    <p class="note">The TV plays the sound in this room.</p>
  {:else if !$sound.question}
    <p class="note" id="sound-warning">
      Some rounds are audio-only. You will not be able to answer those.
    </p>
  {/if}
</section>

<style>
  .switches {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
  }

  .switch {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.3rem;
    padding: calc(0.55rem - var(--border-give)) calc(0.4rem - var(--border-give));
    font-size: 0.85rem;
    line-height: 1.2;
  }

  .switch[aria-pressed='true'] {
    border-color: var(--accent);
    box-shadow: inset 0 0 0 1px var(--accent);
  }

  .switch[aria-pressed='false'] {
    color: var(--muted);
  }

  .switch[aria-pressed='true'] .strike {
    display: none;
  }

  svg {
    width: 24px;
    height: 24px;
  }

  .note {
    margin: 0.5rem 0 0;
    font-size: 0.85rem;
    color: var(--muted);
  }
</style>
