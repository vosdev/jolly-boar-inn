<script lang="ts">
  /**
   * A chathead that can play an emote: the line over it in the game's overhead chat,
   * the game's chatbox font with a black outline in the emote's colour and effect, while the chathead acts
   * it out. It shows for `EMOTE_MS`; a new emote from the same player replaces it.
   *
   * Nothing here clips: the line overhangs the chathead upwards and sideways, so whatever
   * holds this must not hide its overflow. Under reduced motion the line still shows, but
   * neither it nor the chathead moves.
   */
  import type { Snippet } from 'svelte'

  import { shownEmotes } from '../lib/emotes'

  let { playerId, children }: { playerId: string; children: Snippet } = $props()

  const shown = $derived($shownEmotes.get(playerId) ?? null)
</script>

<span class="emoting">
  {#key shown?.key}
    {#if shown !== null}
      <span
        class="say {shown.emote.colour}"
        class:wave={shown.emote.effect === 'wave'}
        class:shake={shown.emote.effect === 'shake'}
        class:sinks={shown.emote.effect === 'sinks'}
      >
        <span class="sr">says</span>
        {#each [...shown.line] as letter, index (index)}
          <span class="letter" style:animation-delay="-{1000 - index * 90}ms">{letter}</span>
        {/each}
      </span>
    {/if}
    <span class="act" data-motion={shown?.emote.motion}>{@render children()}</span>
  {/key}
</span>

<style>
  .emoting {
    position: relative;
    display: inline-flex;
    overflow: visible;
  }

  .act {
    display: inline-flex;
    transform-origin: 50% 90%;
  }

  /* The game's own chat colours, the same in every theme. */
  .say {
    position: absolute;
    bottom: calc(100% + 4px);
    left: 50%;
    z-index: 4;
    font-family: 'RuneScape Chat', var(--font-body);
    font-size: 16px;
    line-height: 1;
    white-space: pre;
    text-shadow:
      1px 0 0 var(--chat-outline),
      -1px 0 0 var(--chat-outline),
      0 1px 0 var(--chat-outline),
      0 -1px 0 var(--chat-outline),
      1px 1px 0 var(--chat-outline);
    transform: translateX(-50%);
    pointer-events: none;
    animation: say 3s both;
  }

  .letter {
    display: inline-block;
  }

  .yellow {
    color: var(--chat-yellow);
  }

  .white {
    color: var(--chat-white);
  }

  .cyan {
    color: var(--chat-cyan);
  }

  .red {
    color: var(--chat-red);
  }

  .glow {
    color: var(--chat-yellow);
    animation:
      say 3s both,
      glow 1.2s linear infinite;
  }

  .wave .letter {
    animation: wave-letter 0.8s ease-in-out infinite;
  }

  .shake .letter {
    animation: shake-letter 0.18s steps(1) infinite;
  }

  .sinks .letter {
    animation: sink-letter 3s ease-in both;
    animation-delay: 0s !important;
  }

  [data-motion='rock'] {
    animation: rock 1.6s ease-in-out;
  }

  [data-motion='bounce'] {
    animation: bounce 1.6s ease-out;
  }

  [data-motion='pulse'] {
    animation: pulse 1.6s;
  }

  [data-motion='hop'] {
    animation: hop 1.2s ease-out;
  }

  [data-motion='tilt'] {
    animation: tilt 1.8s;
  }

  [data-motion='jitter'] {
    animation: jitter 1.6s linear;
  }

  [data-motion='droop'] {
    animation: droop 2.2s ease-in-out;
  }

  [data-motion='jolt'] {
    animation: jolt 1.4s;
  }

  @keyframes say {
    0%,
    90% {
      opacity: 1;
    }
    100% {
      opacity: 0;
    }
  }

  @keyframes glow {
    0%,
    100% {
      color: var(--chat-red);
    }
    20% {
      color: var(--chat-yellow);
    }
    40% {
      color: var(--chat-green);
    }
    60% {
      color: var(--chat-cyan);
    }
    80% {
      color: var(--chat-magenta);
    }
  }

  @keyframes wave-letter {
    0%,
    100% {
      transform: translateY(0);
    }
    50% {
      transform: translateY(-4px);
    }
  }

  @keyframes shake-letter {
    0% {
      transform: translate(0, 0);
    }
    25% {
      transform: translate(-1px, -2px);
    }
    50% {
      transform: translate(1px, 1px);
    }
    75% {
      transform: translate(-1px, 2px);
    }
  }

  @keyframes sink-letter {
    0% {
      transform: translateY(-6px);
    }
    100% {
      transform: translateY(4px);
    }
  }

  @keyframes rock {
    0%,
    100% {
      transform: none;
    }
    15%,
    45%,
    75% {
      transform: rotate(-12deg);
    }
    30%,
    60%,
    90% {
      transform: rotate(12deg);
    }
  }

  @keyframes bounce {
    0%,
    40%,
    80%,
    100% {
      transform: none;
    }
    20%,
    60% {
      transform: translateY(-12px);
    }
  }

  @keyframes pulse {
    0%,
    90%,
    100% {
      transform: none;
    }
    10%,
    30%,
    50%,
    70% {
      transform: scale(1.12);
    }
    20%,
    40%,
    60%,
    80% {
      transform: scale(0.96);
    }
  }

  @keyframes hop {
    0%,
    30%,
    60%,
    100% {
      transform: none;
    }
    15%,
    45% {
      transform: translateY(-8px);
    }
  }

  @keyframes tilt {
    0%,
    100% {
      transform: none;
    }
    20%,
    80% {
      transform: rotate(-14deg) translateX(-2px);
    }
  }

  @keyframes jitter {
    0%,
    100% {
      transform: none;
    }
    5%,
    15%,
    25%,
    35%,
    45%,
    55%,
    65%,
    75%,
    85% {
      transform: translateX(-3px) rotate(-3deg);
    }
    10%,
    20%,
    30%,
    40%,
    50%,
    60%,
    70%,
    80%,
    90% {
      transform: translateX(3px) rotate(3deg);
    }
  }

  @keyframes droop {
    0%,
    100% {
      transform: none;
      filter: none;
    }
    30%,
    80% {
      transform: translateY(5px) rotate(8deg) scale(0.95);
      filter: saturate(0.3) brightness(0.9);
    }
  }

  @keyframes jolt {
    0%,
    40%,
    100% {
      transform: none;
    }
    6% {
      transform: translateY(-5px) scale(1.14) rotate(-6deg);
    }
    12% {
      transform: translateY(2px) scale(0.96) rotate(4deg);
    }
    18% {
      transform: none;
    }
  }

  /* The line still shows, held still, until it leaves. */
  @media (prefers-reduced-motion: reduce) {
    .act,
    .letter,
    .say {
      animation: none !important;
    }
  }
</style>
