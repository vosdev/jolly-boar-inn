<script lang="ts">
  /**
   * A pack question read-only, for the operator: what players see, the right answer
   * marked, and the page it was checked against. Every string is drawn as text.
   */
  import { isHttpsLink } from '../../lib/links'
  import { packAnswer, type PackQuestion } from '../../lib/reports'
  import { screenshotFile } from '../../lib/screenshots.svelte'
  import { difficultyName } from '../../lib/suggestions'
  import ScreenshotAnswer from './ScreenshotAnswer.svelte'

  let { question }: { question: PackQuestion } = $props()

  interface Subject {
    name: string
  }

  const p = $derived(question.payload as Record<string, unknown>)
  const intro = $derived(typeof p.intro === 'string' ? p.intro : null)
  const prompt = $derived(typeof p.prompt === 'string' ? p.prompt : null)
  const image = $derived(
    typeof p.image === 'string' ? p.image : typeof p.screenshot === 'string' ? p.screenshot : null,
  )
  const shot = $derived(screenshotFile(p))
  const quote = $derived(typeof p.quote === 'string' ? p.quote : null)
  const explanation = $derived(typeof p.explanation === 'string' ? p.explanation : null)
  const right = $derived(
    new Set<number>(
      Array.isArray(p.answer_indices)
        ? (p.answer_indices as number[])
        : typeof p.answer_index === 'number'
          ? [p.answer_index]
          : [],
    ),
  )

  function optionText(option: unknown): string {
    if (typeof option === 'string' || typeof option === 'number') return String(option)
    const priced = option as { subject?: Subject; value?: number }
    return `${priced.subject?.name ?? ''} (${priced.value ?? ''})`
  }
</script>

<div class="question">
  {#if question.random_event !== undefined}
    <p class="note">Asked by {question.random_event}</p>
  {/if}
  {#if intro !== null}<p class="intro">{intro}</p>{/if}
  {#if prompt !== null}<p class="prompt">{prompt}</p>{/if}
  {#if quote !== null}<blockquote>{quote}</blockquote>{/if}
  {#if shot !== null}<ScreenshotAnswer file={shot} payload={p} />{/if}
  {#if question.type === 'price_is_right'}
    <p class="prompt">{(p.subject as Subject).name}</p>
    <p class="note">between {p.min} and {p.max} gp, as of {p.as_of}</p>
  {:else if question.type === 'more_less'}
    <p class="note">{p.direction} {p.metric}, as of {p.as_of}</p>
  {/if}
  {#if question.type === 'matching'}
    <ul class="options">
      {#each p.fields as { text?: string; icon?: string }[] as entry, index (index)}
        {@const option = (p.options as { text: string; detail?: string }[])[
          (p.answer as number[])[index] ?? -1
        ]}
        <li>
          {entry.text ?? ''}{#if entry.icon}{' '}<code>{entry.icon}</code>{/if} →
          <strong>{option?.text}</strong>{#if option?.detail}{' '}<span class="note"
              >{option.detail}</span
            >{/if}
        </li>
      {/each}
    </ul>
  {:else if question.type === 'ordering'}
    <ol>
      {#each p.answer as number[] as index (index)}
        {@const entry = (p.entries as { text: string; rank: number }[])[index]}
        <li>{entry?.text} <span class="note">rank {entry?.rank}</span></li>
      {/each}
    </ol>
  {:else if Array.isArray(p.options)}
    <ul class="options">
      {#each p.options as option, index (index)}
        <li class:right={right.has(index)}>
          {optionText(option)}{#if right.has(index)}<span class="mark"> ✓</span>{/if}
        </li>
      {/each}
    </ul>
  {/if}
  <dl>
    <dt>Answer</dt>
    <dd><strong>{packAnswer(question)}</strong></dd>
    {#if explanation !== null}
      <dt>Explanation</dt>
      <dd>{explanation}</dd>
    {/if}
    {#if question.difficulty !== undefined}
      <dt>Difficulty</dt>
      <dd>{difficultyName(question.difficulty)}</dd>
    {/if}
    {#if image !== null}
      <dt>Picture</dt>
      <dd><code>{image}</code></dd>
    {/if}
    {#if question.credit !== undefined}
      <dt>Credit</dt>
      <dd>{question.credit}{question.credit_shown ? ', shown to players' : ', not shown'}</dd>
    {/if}
    <dt>Id</dt>
    <dd><code>{question.id}</code></dd>
  </dl>
  {#each [question.wiki, question.source_url].filter((l) => l !== undefined) as link, index (index)}
    <p class="link">
      {#if isHttpsLink(link)}
        <a href={link} target="_blank" rel="noopener noreferrer">{link} ↗</a>
      {:else}
        <span>{link}</span>
      {/if}
    </p>
  {/each}
</div>

<style>
  .intro {
    font-style: italic;
    margin: 0 0 0.35rem;
  }

  .prompt {
    font-weight: 700;
    margin: 0 0 0.5rem;
  }

  blockquote {
    margin: 0 0 0.5rem;
    padding-left: 0.75rem;
    border-left: 3px solid var(--line);
    font-style: italic;
  }

  .options,
  ol {
    margin: 0 0 0.75rem;
    padding-left: 1.25rem;
  }

  .right {
    font-weight: 700;
    color: var(--ok);
  }

  dl {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 0.35rem 1rem;
    margin: 0 0 0.75rem;
  }

  dt {
    color: var(--muted);
    font-size: 0.9rem;
  }

  dd {
    margin: 0;
    overflow-wrap: anywhere;
  }

  .link {
    margin: 0 0 0.35rem;
    overflow-wrap: anywhere;
  }
</style>
