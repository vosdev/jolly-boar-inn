<script lang="ts">
  /**
   * The button that uses your item on the open question: under the slot on a desktop, and
   * on a phone a bar over the foot strip with the item and its line beside it. One tap, no
   * confirm, since no item hurts when used by mistake. It shows only while the item can be
   * used (`canUse`), from the moment the question takes answers; once used, the phone's bar
   * says what it did until the reveal ends, as the desktop's slot does.
   */
  import { afterUse, canUse, itemLine, itemName, useButton } from '../lib/heldItems'
  import type { HeldItem, OpenQuestion } from '../lib/protocol'
  import { Until } from '../lib/typing.svelte'
  import ItemIcon from './ItemIcon.svelte'

  let {
    held,
    question,
    answered,
    used,
    onUse,
    bar = false,
  }: {
    held: HeldItem | null
    /** The open question; null in its reveal. */
    question: OpenQuestion | null
    answered: boolean
    /** The item used on this question, if any, through its reveal. */
    used: string | null
    onUse: () => void
    /** The phone's bar over the foot strip rather than a button under the slot. */
    bar?: boolean
  } = $props()

  const answerable = new Until(() =>
    question === null ? NaN : Date.parse(question.answerable_at ?? question.opened_at),
  )
  /** The question a tap went out on, so a second tap before the reply sends nothing. */
  let sentOn = $state<string | null>(null)
  const sent = $derived(question !== null && sentOn === question.question_id)
  const usable = $derived(
    answerable.passed && !sent && canUse(held, question, answered, used !== null),
  )
  const label = $derived(held === null ? null : useButton(held.id))

  function use(): void {
    if (question === null) return
    sentOn = question.question_id
    onUse()
  }
</script>

{#if bar}
  {#if used !== null}
    <div class="bar item-bar">
      <span class="square spent"><ItemIcon id={used} size={30} label="" /></span>
      <span class="words"><b>{itemName(used)}</b><span class="line">{afterUse(used)}</span></span>
    </div>
  {:else if usable && held !== null && label !== null}
    <div class="bar item-bar">
      <span class="square"><ItemIcon id={held.id} charges={held.charges} size={30} label="" /></span
      >
      <span class="words"
        ><b>{itemName(held.id, held.charges)}</b><span class="line">{itemLine(held.id)}</span></span
      >
      <button type="button" class="primary" onclick={use}>{label}</button>
    </div>
  {/if}
{:else if usable && label !== null}
  <button type="button" class="primary block" onclick={use}>{label}</button>
{/if}

<style>
  .block {
    width: 100%;
    min-height: 44px;
  }

  .bar {
    position: fixed;
    right: 0.75rem;
    bottom: calc(0.75rem + 52px + 0.5rem + env(safe-area-inset-bottom));
    left: 0.75rem;
    z-index: 5;
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.4rem 0.6rem;
    background: var(--panel);
    color: var(--ink);
    border: var(--border-width) solid var(--line);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
  }

  .square {
    display: grid;
    flex: none;
    place-items: center;
    width: 40px;
    height: 40px;
    background: var(--panel-raised);
    border: var(--border-width) solid var(--line);
    border-radius: var(--radius);
  }

  .spent {
    opacity: 0.45;
  }

  .words {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
    font-size: 0.9rem;
    line-height: 1.3;
  }

  .line {
    font-size: 0.85rem;
    color: var(--muted);
  }

  .bar button {
    flex: none;
    min-height: 44px;
  }
</style>
