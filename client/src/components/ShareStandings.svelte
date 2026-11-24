<script lang="ts">
  /**
   * Copies a finished game's share text (`lib/shareStandings.ts`) with one of two buttons: the
   * top three or everyone, or in a team game the gods alone or with their players.
   * `navigator.clipboard` needs a secure context, so a refused copy shows the text in a field
   * to copy by hand.
   */
  import { tick } from 'svelte'

  import { standingsShareText, type ShareGame, type ShareScope } from '../lib/shareStandings'

  let { game }: { game: ShareGame } = $props()

  const options = $derived<{ value: ShareScope; label: string }[]>(
    game.teamStandings === null
      ? [
          { value: 'top', label: 'Copy top 3 results' },
          { value: 'all', label: 'Copy full results' },
        ]
      : [
          { value: 'top', label: 'Copy gods' },
          { value: 'all', label: 'Copy gods and players' },
        ],
  )

  let scope = $state<ShareScope>('top')
  const text = $derived(standingsShareText(game, scope, location.origin))

  let copied = $state<ShareScope | null>(null)
  let shown = $state(false)
  let field: HTMLTextAreaElement | undefined = $state()
  let timer: ReturnType<typeof setTimeout> | undefined

  async function copy(next: ShareScope): Promise<void> {
    scope = next
    try {
      await navigator.clipboard.writeText(standingsShareText(game, next, location.origin))
      copied = next
      clearTimeout(timer)
      timer = setTimeout(() => (copied = null), 2000)
    } catch {
      shown = true
      await tick()
      field?.select()
    }
  }
</script>

<div class="share">
  {#each options as option (option.value)}
    <button type="button" onclick={() => copy(option.value)}>
      {copied === option.value ? 'Copied' : option.label}
    </button>
  {/each}
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
