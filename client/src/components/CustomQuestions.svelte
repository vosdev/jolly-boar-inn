<script lang="ts">
  /**
   * The host's own questions on the Random events tab: their bank, kept in this browser, with a
   * tick on each the room should ask; one question open at a time in `CustomQuestionForm`;
   * and the file the bank can be saved to and added to from. Ticks are saved too, so the
   * questions tried out in one room come back ticked for the next. The form is a pop-up, which
   * fills a phone, since a question needs more room than a tab has; saved, it joins the list.
   *
   * Each ticked question takes one of the room's random-event slots, so the slot count caps
   * the ticks, and `RandomEvents` above shows it before the host ticks one that will not
   * fit rather than after. Rounds and frequency can still change under a full room, as can
   * a bank ticked for a bigger one; then the game will not start and this panel says why.
   */
  import {
    CUSTOM_TYPES,
    EXPORT_FILENAME,
    HOST_TYPE_LABELS,
    askedBy,
    exportText,
    importText,
    overCap,
    type HostQuestion,
  } from '../lib/customQuestions'
  import type { EventFrequency } from '../lib/protocol'
  import { BANK_MAX, loadBank, sameQuestion, saveBank, type Banked } from '../lib/savedQuestions'
  import ConfirmDialog from './ConfirmDialog.svelte'
  import CustomQuestionForm from './CustomQuestionForm.svelte'
  import MatchingForm from './MatchingForm.svelte'
  import NpcFace from './NpcFace.svelte'
  import Sheet from './Sheet.svelte'

  let {
    questions = $bindable(),
    editing = $bindable(),
    slots,
    frequency,
    atMore,
  }: {
    /** The ticked questions, in bank order: what the room will ask. */
    questions: HostQuestion[]
    /** Whether a question is open in the form, which the doors will not open past. */
    editing: boolean
    /** Random events the rounds make room for at `frequency`. */
    slots: number
    frequency: EventFrequency
    /** The same at `more`, to say whether it would help. */
    atMore: number
  } = $props()

  /** The question open in the form: its place in the bank, `new` for one being added, or null. */
  let open = $state<number | 'new' | null>(null)
  let importErrors = $state<string[]>([])
  let importNote = $state('')
  let fileInput: HTMLInputElement | undefined = $state()
  /** The question waiting on the host to confirm its deletion. */
  let deleting = $state<number | null>(null)

  const saved = loadBank()
  let bank = $state<Banked[]>(saved.bank)
  /** What the host is told about saved questions the rules no longer pass. */
  const droppedNote =
    saved.dropped === 1
      ? '1 saved question no longer works and was removed.'
      : `${saved.dropped} saved questions no longer work and were removed.`

  $effect(() => {
    saveBank(bank)
    questions = bank.filter((entry) => entry.used).map((entry) => entry.question)
  })

  /** The most of a bad file's problems listed; the rest are counted. */
  const SHOWN_ERRORS = 8

  const used = $derived(bank.filter((entry) => entry.used).length)
  const over = $derived(overCap(used, slots, frequency, atMore))
  const full = $derived(used >= slots)
  const bankFull = $derived(bank.length >= BANK_MAX)

  $effect(() => {
    editing = open !== null
  })

  /** Whether the open form is `MatchingForm`: picked in the editor, or the question's type. */
  let matching = $state(false)
  const picker = {
    options: [...CUSTOM_TYPES, 'matching' as const].map((type) => ({
      value: type,
      label: HOST_TYPE_LABELS[type],
    })),
    onpick: (type: string) => (matching = type === 'matching'),
  }

  function edit(at: number | 'new'): void {
    matching = at !== 'new' && bank[at]?.question.type === 'matching'
    importNote = ''
    open = at
  }

  /** A new question is ticked while the room has a slot for it, and banked unticked if not. */
  function save(question: HostQuestion): void {
    if (open === 'new') bank = [...bank, { question, used: !full }]
    else if (open !== null) {
      bank = bank.map((entry, i) => (i === open ? { ...entry, question } : entry))
    }
    open = null
  }

  function toggle(index: number): void {
    bank = bank.map((entry, i) => (i === index ? { ...entry, used: !entry.used } : entry))
  }

  function untickAll(): void {
    bank = bank.map((entry) => ({ ...entry, used: false }))
  }

  function remove(index: number): void {
    bank = bank.filter((_, i) => i !== index)
    deleting = null
  }

  function move(index: number, by: number): void {
    const to = index + by
    if (to < 0 || to >= bank.length) return
    const moved = [...bank]
    const [entry] = moved.splice(index, 1)
    if (entry === undefined) return
    moved.splice(to, 0, entry)
    bank = moved
  }

  function download(): void {
    const text = exportText(bank.map((entry) => entry.question))
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = EXPORT_FILENAME
    link.click()
    URL.revokeObjectURL(url)
  }

  /** Adds a file's questions to the bank, unticked, skipping the ones already in it. */
  async function load(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement
    const file = input.files?.[0]
    // Cleared so picking the same file again, after fixing it, is a change.
    input.value = ''
    if (file === undefined) return
    importNote = ''
    const result = importText(await file.text())
    if (!result.ok) {
      importErrors = result.errors
      return
    }
    const fresh: HostQuestion[] = []
    for (const question of result.questions) {
      const known = [...bank.map((entry) => entry.question), ...fresh]
      if (!known.some((other) => sameQuestion(other, question))) fresh.push(question)
    }
    if (bank.length + fresh.length > BANK_MAX) {
      const room = BANK_MAX - bank.length
      importErrors = [
        `This file has ${fresh.length} new questions, and your list has room for ${room} more of the ${BANK_MAX} it keeps. Delete some first.`,
      ]
      return
    }
    importErrors = []
    bank = [...bank, ...fresh.map((question) => ({ question, used: false }))]
    const skipped = result.questions.length - fresh.length
    const added = fresh.length === 1 ? '1 question' : `${fresh.length} questions`
    importNote =
      fresh.length === 0
        ? 'Every question in this file is already in your list.'
        : `Added ${added}, unticked${skipped > 0 ? `; ${skipped} ${skipped === 1 ? 'was' : 'were'} already in your list` : ''}.`
  }
</script>

{#snippet editor(question: HostQuestion | undefined)}
  {#if matching}
    <MatchingForm
      question={question?.type === 'matching' ? question : undefined}
      asker="optional"
      {picker}
      onsave={save}
      oncancel={() => (open = null)}
    />
  {:else}
    <CustomQuestionForm
      question={question?.type === 'matching' ? undefined : question}
      {picker}
      onsave={save}
      oncancel={() => (open = null)}
    />
  {/if}
{/snippet}

<section class="panel own" aria-labelledby="own-title">
  <div class="head">
    <h2 id="own-title">Write your own</h2>
    <span class="tag">Optional</span>
  </div>
  <p class="note">
    An NPC asks each one you tick in place of a random event. Perfect for your clan's in-jokes.
  </p>

  {#if saved.dropped > 0}
    <p class="note">{droppedNote}</p>
  {/if}

  {#if bank.length > 0}
    <ol class="list">
      {#each bank as entry, index (entry)}
        <li>
          <div class="summary" class:unused={!entry.used}>
            <input
              type="checkbox"
              class="use"
              checked={entry.used}
              disabled={!entry.used && full}
              aria-label="Use question {index + 1} in this room"
              onchange={() => toggle(index)}
            />
            <span class="face"><NpcFace npc={entry.question.random_event} /></span>
            <div class="words">
              <p class="prompt">{entry.question.payload.prompt}</p>
              <p class="note">
                {HOST_TYPE_LABELS[entry.question.type]} · {askedBy(entry.question)}
              </p>
            </div>
            <div class="row actions">
              <button
                type="button"
                class="small"
                aria-label="Move question {index + 1} earlier"
                disabled={index === 0}
                onclick={() => move(index, -1)}>↑</button
              >
              <button
                type="button"
                class="small"
                aria-label="Move question {index + 1} later"
                disabled={index === bank.length - 1}
                onclick={() => move(index, 1)}>↓</button
              >
              <button
                type="button"
                class="small"
                aria-label="Edit question {index + 1}"
                disabled={open !== null}
                onclick={() => edit(index)}>Edit</button
              >
              <button
                type="button"
                class="small"
                aria-label="Delete question {index + 1}"
                disabled={open !== null}
                onclick={() => (deleting = index)}>Delete</button
              >
            </div>
          </div>
        </li>
      {/each}
    </ol>
  {/if}

  {#if open !== null}
    <Sheet
      full
      wide
      label={open === 'new' ? 'New question' : 'Edit question'}
      onclose={() => (open = null)}
    >
      <div class="in-sheet">
        {@render editor(open === 'new' ? undefined : bank[open]?.question)}
      </div>
    </Sheet>
  {/if}

  {#if over !== null}
    <p class="error">{over}</p>
  {/if}

  <div class="row tools">
    <button type="button" disabled={bankFull || open !== null} onclick={() => edit('new')}>
      Write a question
    </button>
    {#if used > 0}
      <button type="button" disabled={open !== null} onclick={untickAll}>Untick all</button>
    {/if}
    <button type="button" disabled={bankFull} onclick={() => fileInput?.click()}>Import…</button>
    <button type="button" disabled={bank.length === 0} onclick={download}>Export</button>
    <input
      bind:this={fileInput}
      class="sr"
      type="file"
      accept=".json,application/json"
      aria-label="Questions file to import"
      tabindex="-1"
      onchange={load}
    />
  </div>
  {#if bank.length > 0}
    <p class="note">
      Saved in this browser for your next room{bankFull ? `, ${BANK_MAX} at most` : ''}.
    </p>
  {/if}
  {#if full && used > 0 && over === null && open === null}
    <p class="note">
      Every random event is already one of yours. Add round questions or pick More frequency to tick
      another; a new question is saved unticked.
    </p>
  {/if}
  {#if importNote !== ''}
    <p class="note" role="status">{importNote}</p>
  {/if}

  {#if importErrors.length > 0}
    <div class="banner bad">
      <p>Nothing was imported:</p>
      <ul>
        {#each importErrors.slice(0, SHOWN_ERRORS) as message (message)}
          <li>{message}</li>
        {/each}
      </ul>
      {#if importErrors.length > SHOWN_ERRORS}
        <p>And {importErrors.length - SHOWN_ERRORS} more.</p>
      {/if}
    </div>
  {/if}

  {#if deleting !== null}
    {@const doomed = deleting}
    <ConfirmDialog
      message={`Delete “${bank[doomed]?.question.payload.prompt}” from your questions? It can’t be undone.`}
      confirmLabel="Delete"
      onConfirm={() => remove(doomed)}
      onCancel={() => (deleting = null)}
    />
  {/if}
</section>

<style>
  .own > .note {
    margin: 0.2rem 0 1rem;
  }

  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  h2 {
    margin: 0;
  }

  /* The sheet is the editor's frame; a second one inside it only costs width. */
  .in-sheet :global(.editor) {
    padding: 0;
    border: none;
    background: none;
  }

  .face {
    flex: none;
    width: 2.6rem;
    height: 2.85rem;
    display: grid;
    place-items: end center;
    overflow: hidden;
    border: var(--border-width) solid var(--line);
    border-radius: min(var(--radius), 6px);
    background: var(--panel-raised);
  }

  .list {
    list-style: none;
    margin: 0 0 1rem;
    padding: 0;
    display: grid;
    gap: 0.75rem;
  }

  .summary {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: 0.5rem 0.75rem;
    padding-bottom: 0.75rem;
    border-bottom: 1px solid var(--line);
  }

  .use {
    flex: none;
    margin-top: 0.9rem;
  }

  /* Kept in the bank, but not asked in this room. */
  .unused .face,
  .unused .words {
    opacity: 0.6;
  }

  .words {
    flex: 1 1 11rem;
    min-width: 0;
  }

  .words p {
    margin: 0;
    overflow-wrap: anywhere;
  }

  .tools {
    margin-top: 1rem;
  }

  .banner ul {
    margin: 0.4rem 0;
    padding-left: 1.25rem;
  }

  .banner p {
    margin: 0;
  }
</style>
