<script lang="ts">
  /**
   * `pick_from_list`: a strict combobox over a closed list, and a Submit button.
   *
   * Every mode on this type answers through this control — Guess the Examine now, Who's
   * That NPC? and Pixel Hunt later — so nothing in it knows what the question is about.
   * The stem above says that; this is only "find it in the list, pick it, send it".
   *
   * **Strict** means selection only (architecture section 2). What the player types is a
   * search, never an answer: the value sent is the id of an entry they picked, and there is
   * no path from the text box to the wire that skips picking. That is the whole reason the
   * type exists — an id is right or it is not, so nothing needs normalising at the reveal.
   *
   * The behaviour, which the tests hold it to:
   *
   * - The WAI-ARIA combobox pattern: an input with `role="combobox"`, a `listbox` popup,
   *   and `aria-activedescendant` naming the highlighted option, so a screen reader hears
   *   the highlight move while focus stays in the text box.
   * - Focus opens the whole list, alphabetical: a player who cannot spell it can scroll to
   *   it. Typing filters it (`lib/vocab.ts`) and highlights the first match.
   * - Arrow keys move the highlight, Enter or a tap selects, Escape closes. The box then
   *   shows the selected name, and editing it clears the selection.
   * - No match is one line saying so, and selects nothing.
   * - Submit is disabled until something is selected, and selecting is not submitting: on a
   *   phone a mis-tap costs a second tap, not the question.
   *
   * On a phone the keyboard takes half the screen, and a list that opens under the text
   * box opens behind it. So focusing scrolls the box to the top of what is visible, and the
   * list is never taller than the space left between the box and the keyboard, measured
   * off `visualViewport`, which is the part of the page the keyboard is not covering.
   *
   * The list comes from `lib/vocab.ts`, fetched once per session — usually during the
   * round's splash, so it is already here when the first question opens.
   *
   * `data` is `client_view(payload)` while open — `prompt`, `vocab` — and `reveal(payload)`
   * after close, which adds `answer_id` and `subject`.
   */
  import { tick } from 'svelte'

  import { loadVocab, search, type Vocab, type VocabEntry } from '../../../lib/vocab'
  import type { TypeViewProps } from '../props'

  /** A vocabulary entry's id: the only thing this control ever sends. */
  type EntryId = number

  interface Data {
    vocab?: string
    /** Reveal only. */
    answer_id?: EntryId
    subject?: { name?: string }
  }

  let {
    data,
    revealed,
    yourValue,
    canAnswer,
    result = null,
    onAnswer,
  }: TypeViewProps<EntryId> = $props()

  const q = $derived(data as unknown as Data)
  const uid = $props.id()
  const listId = `${uid}-list`

  let list = $state<Vocab | null>(null)
  let failed = $state(false)

  async function fetchList(name: string): Promise<void> {
    failed = false
    try {
      list = await loadVocab(name)
    } catch {
      failed = true
    }
  }

  $effect(() => {
    if (typeof q.vocab === 'string') void fetchList(q.vocab)
  })

  const nameOf = (id: unknown): string | null =>
    typeof id === 'number' ? (list?.entries.find((e) => e.id === id)?.name ?? null) : null

  let query = $state('')
  let selected = $state<VocabEntry | null>(null)
  let expanded = $state(false)
  let active = $state(0)
  let input = $state<HTMLInputElement | null>(null)
  let listbox = $state<HTMLUListElement | null>(null)
  let maxHeight = $state<number | null>(null)

  const matches = $derived(list === null ? [] : search(list.entries, query))
  const answered = $derived(typeof yourValue === 'number' ? yourValue : null)
  const locked = $derived(revealed || !canAnswer || answered !== null)
  const optionId = (index: number) => `${uid}-option-${index}`

  function open(): void {
    if (locked || list === null) return
    expanded = true
    fitList()
  }

  function close(): void {
    expanded = false
  }

  function select(entry: VocabEntry): void {
    selected = entry
    query = entry.name
    close()
  }

  function onInput(): void {
    // The box now says something other than the selection, so it is a search again.
    selected = null
    active = 0
    open()
  }

  async function highlight(index: number): Promise<void> {
    active = Math.max(0, Math.min(matches.length - 1, index))
    await tick()
    listbox?.querySelector(`#${CSS.escape(optionId(active))}`)?.scrollIntoView?.({
      block: 'nearest',
    })
  }

  function onKeydown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp':
        event.preventDefault()
        if (!expanded) {
          open()
          void highlight(selected === null ? 0 : matches.indexOf(selected))
        } else {
          void highlight(active + (event.key === 'ArrowDown' ? 1 : -1))
        }
        break
      case 'Enter':
        // Enter picks; it never submits. Submitting is the button's job alone.
        event.preventDefault()
        if (expanded && matches[active] !== undefined) select(matches[active])
        break
      case 'Escape':
        if (expanded) {
          event.preventDefault()
          close()
        }
        break
    }
  }

  function onFocus(): void {
    open()
    // Put the box at the top of what the keyboard leaves visible, so the list has room.
    input?.scrollIntoView?.({ block: 'start', behavior: 'smooth' })
  }

  /** The list's height: what is left between the box and the bottom of the visual viewport. */
  function fitList(): void {
    const viewport = window.visualViewport
    if (input === null || viewport === null || viewport === undefined) {
      maxHeight = null
      return
    }
    const below = viewport.offsetTop + viewport.height - input.getBoundingClientRect().bottom
    maxHeight = Math.max(120, Math.floor(below) - 12)
  }

  // The keyboard opening resizes the visual viewport; the scroll that focusing starts
  // moves the box. Either changes the room below it, so both re-measure.
  $effect(() => {
    const viewport = window.visualViewport
    if (!expanded || viewport === null || viewport === undefined) return
    viewport.addEventListener('resize', fitList)
    viewport.addEventListener('scroll', fitList)
    window.addEventListener('scroll', fitList, { passive: true })
    return () => {
      viewport.removeEventListener('resize', fitList)
      viewport.removeEventListener('scroll', fitList)
      window.removeEventListener('scroll', fitList)
    }
  })

  function submit(): void {
    if (selected !== null && !locked) onAnswer(selected.id)
  }

  const answerName = $derived(
    revealed ? (q.subject?.name ?? nameOf(q.answer_id) ?? null) : null,
  )
  const pickedName = $derived(answered === null ? null : nameOf(answered))
</script>

{#if locked}
  <div class="settled">
    {#if revealed && answerName !== null}
      <p class="answer">It was <strong>{answerName}</strong>.</p>
    {/if}
    {#if answered !== null}
      <p
        class="picked"
        class:right={revealed && result?.correct === true}
        class:wrong={revealed && result !== null && !result.correct}
      >
        Your answer: <strong>{pickedName ?? (list === null ? '…' : 'not in this list')}</strong>
      </p>
    {/if}
  </div>
{:else if failed}
  <p class="note">The list could not be loaded.</p>
  <button type="button" onclick={() => typeof q.vocab === 'string' && fetchList(q.vocab)}>
    Try again
  </button>
{:else if list === null}
  <p class="note">Loading the list…</p>
{:else}
  <form
    class="pick"
    onsubmit={(event) => {
      event.preventDefault()
      submit()
    }}
  >
    <label class="label" for="{uid}-input">Search the list</label>
    <div class="field">
      <input
        bind:this={input}
        bind:value={query}
        id="{uid}-input"
        type="text"
        role="combobox"
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
        enterkeyhint="done"
        placeholder="Start typing a name…"
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-activedescendant={expanded && matches.length > 0 ? optionId(active) : undefined}
        oninput={onInput}
        onfocus={onFocus}
        onclick={open}
        onblur={close}
        onkeydown={onKeydown}
      />
      <ul
        bind:this={listbox}
        id={listId}
        role="listbox"
        aria-label="Matches"
        hidden={!expanded}
        style:max-height={maxHeight === null ? null : `${maxHeight}px`}
      >
        {#each matches as entry, index (entry.id)}
          <!-- The keys belong to the input, which keeps focus throughout: that is the
               combobox pattern, and an option that took focus would close the keyboard. -->
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <li
            id={optionId(index)}
            role="option"
            aria-selected={index === active}
            class:active={index === active}
            onpointerdown={(event) => event.preventDefault()}
            onclick={() => select(entry)}
          >
            {entry.name}
          </li>
        {:else}
          <li class="empty" role="option" aria-selected="false" aria-disabled="true">
            Nothing in the list matches “{query.trim()}”.
          </li>
        {/each}
      </ul>
    </div>
    <button type="submit" class="primary" disabled={selected === null}>Submit</button>
  </form>
{/if}

{#if !canAnswer}
  <p class="note">
    {revealed
      ? 'This one was not scored for you.'
      : 'This one is not scored for you — sit back and watch.'}
  </p>
{:else if revealed && result !== null}
  <p class="verdict" class:good={result.correct}>
    {result.correct ? `Right — ${result.points} points` : 'Wrong — no points'}
  </p>
{:else if revealed}
  <p class="note">No answer from you this round, so no points.</p>
{/if}

<style>
  .pick {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  .label {
    color: var(--muted);
  }

  .field {
    position: relative;
  }

  .field input {
    width: 100%;
    box-sizing: border-box;
    font-size: 1.1rem;
  }

  /* In the flow rather than floating, so it pushes Submit down instead of covering it,
     and so the page, not a popup, is what scrolls when the keyboard is up. */
  [role='listbox'] {
    list-style: none;
    margin: 0.35rem 0 0;
    padding: 0.25rem;
    max-height: 40vh;
    overflow-y: auto;
    overscroll-behavior: contain;
    border: var(--border-width) solid var(--line);
    border-radius: var(--radius);
    background: var(--panel-raised);
  }

  [role='listbox'][hidden] {
    display: none;
  }

  [role='option'] {
    padding: 0.55rem 0.6rem;
    border-radius: calc(var(--radius) - 2px);
    cursor: pointer;
  }

  [role='option'].active {
    background: var(--accent);
    color: var(--accent-ink);
  }

  [role='option'].empty {
    cursor: default;
    color: var(--muted);
  }

  .pick button {
    align-self: flex-start;
  }

  .settled p {
    margin: 0 0 0.5rem;
    font-size: 1.1rem;
  }

  .picked.right {
    color: var(--ok);
  }

  .picked.wrong {
    color: var(--bad);
  }

  .verdict {
    margin: 1rem 0 0;
    font-weight: 600;
    color: var(--bad);
  }

  .verdict.good {
    color: var(--ok);
  }
</style>
