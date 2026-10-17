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
   * - while open, `client_view(payload)`: the prompt. Nothing about the answer, not even
   *   its length.
   * - after close, `reveal(payload)`: the same plus `accepted`, every spelling the author
   *   would take with the first as *the* answer, and optionally `subject`, what the
   *   answer is, and an `explanation` that `Question` draws. A subject is named in place
   *   of the first spelling, as `PickFromList` names its own, and the spellings follow it.
   */
  import AnswerForm from '../AnswerForm.svelte'
  import AnswerSettled from '../AnswerSettled.svelte'
  import type { TypeViewProps } from '../props'

  /** The server's cap on a typed answer, `free_text.MAX_LENGTH`. */
  const MAX_LENGTH = 80

  interface Data {
    /** Reveal only. */
    accepted?: string[]
    /** Reveal only, and optional there. */
    subject?: { name?: string }
  }

  let { data, revealed, yourValue, canAnswer, onAnswer }: TypeViewProps<string> = $props()

  const q = $derived(data as unknown as Data)
  const uid = $props.id()

  let text = $state('')
  const answered = $derived(typeof yourValue === 'string' ? yourValue : null)
  const locked = $derived(revealed || !canAnswer || answered !== null)
  const accepted = $derived(revealed && Array.isArray(q.accepted) ? q.accepted : [])
  const answerName = $derived(revealed ? (q.subject?.name ?? accepted[0] ?? null) : null)
  // Case aside, the name already says a spelling, and "also" should not repeat it.
  const others = $derived(
    accepted.filter((spelling) => spelling.toLowerCase() !== answerName?.toLowerCase()),
  )

  function submit(): void {
    const answer = text.trim()
    if (answer !== '' && !locked) onAnswer(answer)
  }
</script>

{#if locked}
  <AnswerSettled answer={answerName} also={others} yours={answered} />
{:else}
  <AnswerForm
    id="{uid}-answer"
    label="Type your answer — capitals and punctuation do not matter"
    ready={text.trim() !== ''}
    onsubmit={submit}
  >
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
  </AnswerForm>
{/if}
