<script lang="ts">
  /**
   * `closest_number`: type a number, and the nearest guess in the room wins.
   *
   * Nobody is expected to know it — how many kills, how many hours — so the view says
   * what the scoring does: it is not about speed, and a near miss still scores. Being
   * first earns nothing here (`SCORING = RANK`), and a player who knows that takes the
   * whole clock to think rather than rushing a guess in.
   *
   * What a player types is read by `parseAmount` (`lib/gp.ts`), so `1.6m` and `12,500`
   * work the way the game writes numbers. The value sent is a plain number; Submit stays
   * disabled until the box holds one.
   *
   * `data` arrives in the two shapes `questions/types/closest_number.py` sends:
   *
   * - while open, `client_view(payload)`: the prompt, and the `unit` to answer in if the
   *   author gave one.
   * - after close, `reveal(payload)`: the same plus `answer` and an optional
   *   `explanation`.
   *
   * The reveal's points are the rank table, not a bucket: 1000 for exact, then 800, 600,
   * 400 for the three closest misses and 200 for having a go. The points slot in `Room`
   * shows them (D8); this view says how far off the guess was, which is the answer, not
   * the reason for the number.
   */
  import { parseAmount } from '../../../lib/gp'
  import type { TypeViewProps } from '../props'

  interface Data {
    unit?: string
    /** Reveal only. */
    answer?: number
    /** Reveal only, and optional there. */
    explanation?: string
  }

  let { data, revealed, yourValue, canAnswer, onAnswer }: TypeViewProps<number> = $props()

  const q = $derived(data as unknown as Data)
  const uid = $props.id()
  const unit = $derived(typeof q.unit === 'string' && q.unit !== '' ? q.unit : null)

  let text = $state('')
  const guess = $derived(parseAmount(text))
  const answered = $derived(typeof yourValue === 'number' ? yourValue : null)
  const locked = $derived(revealed || !canAnswer || answered !== null)

  /** A number as a person reads one: grouped, and no longer than it has to be. */
  function written(n: number): string {
    const number = n.toLocaleString('en-GB', { maximumFractionDigits: 6 })
    return unit === null ? number : `${number} ${unit}`
  }

  const off = $derived(
    revealed && answered !== null && typeof q.answer === 'number'
      ? Math.abs(answered - q.answer)
      : null,
  )

  function submit(event: SubmitEvent): void {
    event.preventDefault()
    if (guess !== null && !locked) onAnswer(guess)
  }
</script>

{#if locked}
  <div class="settled">
    {#if revealed && typeof q.answer === 'number'}
      <p class="answer">It was <strong>{written(q.answer)}</strong>.</p>
    {/if}
    {#if answered !== null}
      <p class="picked">
        Your guess: <strong>{written(answered)}</strong>{#if off !== null}{off === 0
            ? ', spot on'
            : `, off by ${written(off)}`}{/if}
      </p>
    {/if}
  </div>
{:else}
  <form class="guess" onsubmit={submit}>
    <label for="{uid}-guess" class="label">
      Your best guess{unit === null ? '' : ` (${unit})`} — the closest one wins, however late
    </label>
    <div class="row">
      <input
        id="{uid}-guess"
        type="text"
        inputmode="decimal"
        autocomplete="off"
        spellcheck="false"
        enterkeyhint="done"
        placeholder="A number"
        aria-invalid={text.trim() !== '' && guess === null}
        bind:value={text}
      />
      <button type="submit" class="primary" disabled={guess === null}>Submit</button>
    </div>
    {#if text.trim() !== '' && guess === null}
      <p class="note">That is not a number. 12,500 and 1.6m both are.</p>
    {/if}
  </form>
{/if}

{#if !canAnswer && !revealed}
  <p class="note">This one is not scored for you — sit back and watch.</p>
{/if}

{#if revealed && q.explanation}
  <p class="explanation">{q.explanation}</p>
{/if}

<style>
  .guess {
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

  /* Thumb targets (D8): the box and its button are as tall as an answer button. */
  .row input,
  .row button {
    min-height: 56px;
  }

  .settled p {
    margin: 0 0 0.5rem;
    font-size: 1.1rem;
  }

  /* Your answer, held while the room answers and receding beside the real one after:
     the verdict is the points slot's, so this card never turns green or red. */
  .picked {
    color: var(--muted);
  }

  .explanation {
    margin: 1rem 0 0;
    overflow-wrap: anywhere;
  }
</style>
