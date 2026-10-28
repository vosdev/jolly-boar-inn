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
   * The list floats over the page, so opening it moves nothing and the page never scrolls
   * for its length. On a phone the keyboard takes half the screen, so the list opens above
   * the box, and is never taller than the space between the box and the screen edge,
   * measured off `visualViewport`, the part of the page the keyboard is not covering.
   *
   * The list comes from `lib/vocab.ts`, fetched once per session — `Room` starts that as
   * the question arrives, so during a random event's hold it is already on its way.
   *
   * `data` is `client_view(payload)` while open — `prompt`, `vocab` — and `reveal(payload)`
   * after close, which adds `answer_id`, `subject` and an `explanation` that `Question`
   * draws.
   */
  import { tick } from 'svelte'

  import { loadVocab, search, SHOWN_MAX, type Vocab, type VocabEntry } from '../../../lib/vocab'
  import AnswerSettled from '../AnswerSettled.svelte'
  import type { TypeViewProps } from '../props'

  /** A vocabulary entry's id: the only thing this control ever sends. */
  type EntryId = number

  interface Data {
    vocab?: string
    /** Reveal only. */
    answer_id?: EntryId
    subject?: { name?: string }
  }

  let { data, revealed, yourValue, canAnswer, onAnswer }: TypeViewProps<EntryId> = $props()

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

  /** The width where the keyboard covers the room below the box: the list opens above. */
  const PHONE_QUERY = '(max-width: 40rem)'
  /** The least height worth opening a list in. */
  const MIN_LIST_HEIGHT = 120

  const nameOf = (id: unknown): string | null =>
    typeof id === 'number' ? (list?.entries.find((e) => e.id === id)?.name ?? null) : null

  let query = $state('')
  let selected = $state<VocabEntry | null>(null)
  let expanded = $state(false)
  let active = $state(0)
  let input = $state<HTMLInputElement | null>(null)
  let listbox = $state<HTMLUListElement | null>(null)
  let maxHeight = $state<number | null>(null)
  let above = $state(false)

  const matches = $derived(list === null ? [] : search(list.entries, query))
  const shown = $derived(matches.slice(0, SHOWN_MAX))
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
    active = Math.max(0, Math.min(shown.length - 1, index))
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
          void highlight(selected === null ? 0 : shown.indexOf(selected))
        } else {
          void highlight(active + (event.key === 'ArrowDown' ? 1 : -1))
        }
        break
      case 'Enter': {
        // Enter picks; it never submits. Submitting is the button's job alone.
        event.preventDefault()
        const entry = shown[active]
        if (expanded && entry !== undefined) select(entry)
        break
      }
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
    // The list floats, so the page never has to move for it. Only a box the keyboard
    // hides is brought into view.
    input?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })
  }

  /**
   * Which side of the box the list opens on, and how tall it may be there. A phone opens
   * it above, clear of the keyboard; a desktop below. Either flips when the other side
   * has more room and the preferred one is too small to use.
   */
  function fitList(): void {
    const viewport = window.visualViewport
    const preferAbove = window.matchMedia?.(PHONE_QUERY).matches ?? false
    if (input === null || viewport === null || viewport === undefined) {
      above = preferAbove
      maxHeight = null
      return
    }
    const box = input.getBoundingClientRect()
    // The room may be scaled to the window; the list's max-height is in its own px.
    const scale = input.offsetHeight > 0 ? box.height / input.offsetHeight : 1
    // A list past the edge of a scrolling stage would lengthen the stage and scroll it.
    const clip = scrollerOf(input)?.getBoundingClientRect()
    const top = Math.max(viewport.offsetTop, clip?.top ?? -Infinity)
    const bottom = Math.min(viewport.offsetTop + viewport.height, clip?.bottom ?? Infinity)
    const room = {
      above: (box.top - top) / scale,
      below: (bottom - box.bottom) / scale,
    }
    const preferred = preferAbove ? 'above' : 'below'
    const other = preferAbove ? 'below' : 'above'
    const side =
      room[preferred] < MIN_LIST_HEIGHT && room[other] > room[preferred] ? other : preferred
    above = side === 'above'
    maxHeight = Math.max(MIN_LIST_HEIGHT, Math.floor(room[side]) - 12)
  }

  function scrollerOf(element: HTMLElement): HTMLElement | null {
    for (let up = element.parentElement; up !== null; up = up.parentElement) {
      if (/auto|scroll/.test(getComputedStyle(up).overflowY)) return up
    }
    return null
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

  const answerName = $derived(revealed ? (q.subject?.name ?? nameOf(q.answer_id) ?? null) : null)
  const pickedName = $derived(answered === null ? null : nameOf(answered))
</script>

{#if locked}
  <AnswerSettled
    answer={answerName}
    yours={answered === null ? null : (pickedName ?? (list === null ? '…' : 'not in this list'))}
  />
{:else if typeof q.vocab !== 'string'}
  <div class="pick">
    <div class="field">
      <input
        id="{uid}-input"
        type="text"
        role="combobox"
        placeholder="Start typing a name…"
        aria-label="Search the list"
        aria-autocomplete="list"
        aria-expanded="false"
        aria-controls={listId}
        disabled
      />
    </div>
    <button type="button" class="primary" disabled>Submit</button>
    <p class="note">The NPC joins the list once imported.</p>
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
        aria-label="Search the list"
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-activedescendant={expanded && shown.length > 0 ? optionId(active) : undefined}
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
        class:above
        style:max-height={maxHeight === null ? null : `${maxHeight}px`}
      >
        {#each shown as entry, index (entry.id)}
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
        {#if matches.length > shown.length}
          <li class="empty" role="option" aria-selected="false" aria-disabled="true">
            {matches.length - shown.length} more — keep typing to narrow the list.
          </li>
        {/if}
      </ul>
    </div>
    <button type="submit" class="primary" disabled={selected === null}>Submit</button>
  </form>
{/if}

<style>
  .pick {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  .field {
    position: relative;
  }

  /* Section 7.2: the search field full width and 56px tall, like an answer button. */
  .field input {
    width: 100%;
    min-height: 56px;
    box-sizing: border-box;
    font-size: 1.1rem;
  }

  /* Floating over the page rather than in the flow, so opening it never moves anything
     and the page never scrolls for its length. */
  [role='listbox'] {
    position: absolute;
    inset-inline: 0;
    top: 100%;
    z-index: 10;
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

  [role='listbox'].above {
    top: auto;
    bottom: 100%;
    margin: 0 0 0.35rem;
  }

  [role='listbox'][hidden] {
    display: none;
  }

  [role='option'] {
    display: flex;
    align-items: center;
    /* The stage keeps room for five of these under the input (lib/pictureFit.ts). */
    min-height: 2.5rem;
    box-sizing: border-box;
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
    min-height: 56px;
  }

  .pick .note {
    margin: 0;
  }
</style>
