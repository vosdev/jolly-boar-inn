<script lang="ts">
  /**
   * Copies a finished game's share text (`lib/shareStandings.ts`), the top three or everyone,
   * or in a team game the gods alone or with their players. `navigator.clipboard` needs a
   * secure context, so a refused copy shows the text in a field to copy by hand.
   */
  import { tick } from 'svelte'

  import { standingsShareText, type ShareGame, type ShareScope } from '../lib/shareStandings'
  import Segmented from './Segmented.svelte'

  let { game }: { game: ShareGame } = $props()

  const options = $derived<{ value: ShareScope; label: string }[]>(
    game.teamStandings === null
      ? [
          { value: 'top', label: 'Top 3' },
          { value: 'all', label: 'Everyone' },
        ]
      : [
          { value: 'top', label: 'Gods' },
          { value: 'all', label: 'With players' },
        ],
  )

  let scope = $state<ShareScope>('top')
  const text = $derived(standingsShareText(game, scope, location.origin))

  let copied = $state(false)
  let shown = $state(false)
  let field: HTMLTextAreaElement | undefined = $state()
  let timer: ReturnType<typeof setTimeout> | undefined

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(text)
      copied = true
      clearTimeout(timer)
      timer = setTimeout(() => (copied = false), 2000)
    } catch {
      shown = true
      await tick()
      field?.select()
    }
  }
</script>

<div class="share">
  <Segmented legend="What to share" hideLegend {options} bind:value={scope} />
  <button type="button" onclick={copy}>{copied ? 'Copied' : 'Copy result'}</button>
</div>
{#if shown}
  <textarea readonly rows="6" bind:this={field} value={text} aria-label="The result"></textarea>
{/if}

<style>
  .share {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 0.75rem;
    margin-bottom: 0.75rem;
  }

  textarea {
    width: 100%;
    margin-bottom: 0.75rem;
    font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  }
</style>
