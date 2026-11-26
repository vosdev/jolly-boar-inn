<script lang="ts">
  /**
   * The OSRS trivia questions page: every unpictured mode's Try a question sample, written out
   * with its answer folded away, for a host who wants quiz material and for search. The
   * server sends the same words in the page (`seo.ts`), so a crawler reads them without this.
   */
  import { SHOWN } from '../components/ModeShowcase.svelte'
  import { rulesOf } from '../lib/modeRules'
  import { modeCopy } from '../lib/modes'
  import { siteName } from 'virtual:branding'
  import { triviaIntro } from '../lib/seo'
  import { triviaQuestions } from '../lib/triviaQuestions'

  let { navigate }: { navigate: (to: string) => void } = $props()

  const samples = modeCopy('sample')
  const questions = triviaQuestions(
    SHOWN.map((mode) => ({
      id: mode.id,
      label: mode.label,
      hint: mode.hint,
      ask: mode.ask[0] ?? mode.hint,
      pictured: rulesOf(mode.id)?.pictured ?? false,
      ...(samples[mode.id] === undefined ? {} : { sample: samples[mode.id] }),
    })),
  )

  function go(event: MouseEvent, to: string): void {
    // A modified click is somebody asking for a new tab; let the browser have it.
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return
    }
    event.preventDefault()
    navigate(to)
    scrollTo(0, 0)
  }
</script>

<section class="panel">
  <h1>OSRS trivia questions</h1>
  <p>{triviaIntro(siteName)}</p>
  <ol class="questions">
    {#each questions as question (question.mode)}
      <li>
        <h2>{question.label}</h2>
        <p class="note">{question.hint}</p>
        <p class="ask">{question.question}</p>
        {#if question.subject !== undefined}<p class="subject">{question.subject}</p>{/if}
        {#if question.quote !== undefined}<blockquote>{question.quote}</blockquote>{/if}
        {#if question.clues !== undefined}
          <ol class="clues">
            {#each question.clues as clue (clue)}<li>{clue}</li>{/each}
          </ol>
        {/if}
        {#if question.options !== undefined}
          <ul class="options">
            {#each question.options as option (option)}<li>{option}</li>{/each}
          </ul>
        {/if}
        <details>
          <summary>Show answer</summary>
          <p class="answer">{question.answer}</p>
          {#if question.detail !== undefined}<p class="note">{question.detail}</p>{/if}
        </details>
        <p>
          <a href={question.path} onclick={(event) => go(event, question.path)}>
            Try this question
          </a>
        </p>
      </li>
    {/each}
  </ol>
  <p>
    <button type="button" class="primary" onclick={() => navigate('/create')}>Create a room</button>
  </p>
</section>

<style>
  .questions {
    display: grid;
    gap: 1.5rem;
    margin: 1.5rem 0;
    padding: 0;
    list-style: none;
  }

  h2 {
    margin: 0;
  }

  .ask,
  .answer,
  .subject {
    font-weight: 600;
  }

  blockquote {
    margin: 0.5rem 0;
    padding-left: 0.75rem;
    border-left: var(--border-width) solid var(--line);
    font-style: italic;
  }

  .options,
  .clues {
    margin: 0.5rem 0;
  }

  summary {
    cursor: pointer;
  }
</style>
