<script lang="ts">
  /**
   * `free_text`: type the answer, and be forgiven a typo.
   *
   * Only the host's own questions use it — a clan member's name, the boss somebody's pet
   * came from — because every pack mode that wanted a text box moved to a list the player
   * picks from (`PickFromList`). There is no list here, so the box takes anything up to 80
   * characters and the server decides (`questions/normalize.py`): case, punctuation and
   * spacing do not count, and a slip on a longer answer is usually forgiven. The view
   * says the part that always holds, so nobody burns their seconds on capital letters.
   *
   * Enter submits. Unlike the combobox, where Enter picks from the list, there is nothing
   * here to pick: what is typed is the answer.
   *
   * `data` arrives in the two shapes `questions/types/free_text.py` sends:
   *
   * - while open, `client_view(payload)`: the prompt, and an `image` ref. Nothing about
   *   the answer, not even its length.
   * - after close, `reveal(payload)`: the same plus `accepted`, every spelling the author
   *   would take with the first as *the* answer, and an optional `explanation`.
   */
  import type { TypeViewProps } from '../props'

  /** The server's cap on a typed answer, `free_text.MAX_LENGTH`. */
  const MAX_LENGTH = 80

  interface Data {
    /** Reveal only. */
    accepted?: string[]
    /** Reveal only, and optional there. */
    explanation?: string
  }

  let {
    data,
    revealed,
    yourValue,
    canAnswer,
    result = null,
    onAnswer,
  }: TypeViewProps<string> = $props()

  const q = $derived(data as unknown as Data)
  const uid = $props.id()

  let text = $state('')
  const answered = $derived(typeof yourValue === 'string' ? yourValue : null)
  const locked = $derived(revealed || !canAnswer || answered !== null)
  const accepted = $derived(revealed && Array.isArray(q.accepted) ? q.accepted : [])

  function submit(event: SubmitEvent): void {
    event.preventDefault()
    const answer = text.trim()
    if (answer !== '' && !locked) onAnswer(answer)
  }
</script>

{#if locked}
  <div class="settled">
    {#if accepted.length > 0}
      <p class="answer">It was <strong>{accepted[0]}</strong>.</p>
      {#if accepted.length > 1}
        <p class="note">Also accepted: {accepted.slice(1).join(', ')}</p>
      {/if}
    {/if}
    {#if answered !== null}
      <p
        class="picked"
        class:right={revealed && result?.correct === true}
        class:wrong={revealed && result !== null && !result.correct}
      >
        Your answer: <strong>{answered}</strong>
      </p>
    {/if}
  </div>
{:else}
  <form class="typed" onsubmit={submit}>
    <label for="{uid}-answer" class="label">
      Type your answer — capitals and punctuation do not matter
    </label>
    <div class="row">
      <input
        id="{uid}-answer"
        type="text"
        maxlength={MAX_LENGTH}
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
        enterkeyhint="send"
        bind:value={text}
      />
      <button type="submit" class="primary" disabled={text.trim() === ''}>Submit</button>
    </div>
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

{#if revealed && q.explanation}
  <p class="explanation">{q.explanation}</p>
{/if}

<style>
  .typed {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  .label {
    color: var(--muted);
  }

  .row {
    display: flex;
    gap: 0.6rem;
  }

  .row input {
    flex: 1;
    min-width: 0;
    font-size: 1.1rem;
  }

  .settled p {
    margin: 0 0 0.5rem;
    font-size: 1.1rem;
    overflow-wrap: anywhere;
  }

  .settled p.note {
    font-size: inherit;
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

  .explanation {
    margin: 1rem 0 0;
    overflow-wrap: anywhere;
  }
</style>
