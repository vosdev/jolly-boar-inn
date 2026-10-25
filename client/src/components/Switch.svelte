<script lang="ts">
  /** A labelled on/off switch: the Full screen and Ready controls share this look. */
  interface Props {
    label: string
    checked: boolean
    onclick: () => void
    disabled?: boolean
    /** The colour of the on state; `ok` is the theme's green. */
    tone?: 'accent' | 'ok'
    large?: boolean
    describedby?: string
  }

  let {
    label,
    checked,
    onclick,
    disabled = false,
    tone = 'accent',
    large = false,
    describedby,
  }: Props = $props()
</script>

<button
  type="button"
  role="switch"
  aria-checked={checked}
  aria-describedby={describedby}
  class="switch {tone}"
  class:large
  {disabled}
  {onclick}
>
  <span class="track" aria-hidden="true"><span class="thumb"></span></span>
  {label}
</button>

<style>
  .switch {
    display: inline-flex;
    align-items: center;
    gap: 0.6rem;
    min-height: 44px;
    --track-w: 2.6rem;
    --track-h: 1.5rem;
    --thumb: 1rem;
  }

  .large {
    gap: 0.8rem;
    font-size: 1.15rem;
    --track-w: 3.6rem;
    --track-h: 2.1rem;
    --thumb: 1.5rem;
  }

  .track {
    position: relative;
    flex: none;
    width: var(--track-w);
    height: var(--track-h);
    border: var(--border-width) solid var(--line);
    border-radius: 999px;
    background: var(--panel);
    opacity: 0.6;
    transition:
      background-color 150ms ease-out,
      opacity 150ms ease-out;
  }

  .thumb {
    position: absolute;
    top: 50%;
    left: 0.15rem;
    width: var(--thumb);
    height: var(--thumb);
    border-radius: 50%;
    background: var(--muted);
    transform: translateY(-50%);
    transition:
      left 150ms ease-out,
      background-color 150ms ease-out;
  }

  [aria-checked='true'] .track {
    background: var(--accent);
    opacity: 1;
  }

  .ok[aria-checked='true'] .track {
    background: var(--ok);
  }

  [aria-checked='true'] .thumb {
    left: calc(100% - var(--thumb) - 0.15rem);
    background: var(--panel);
  }

  @media (prefers-reduced-motion: reduce) {
    .track,
    .thumb {
      transition: none;
    }
  }
</style>
