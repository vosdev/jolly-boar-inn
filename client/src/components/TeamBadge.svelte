<script lang="ts">
  /**
   * The player's team, as a tab hanging from the bar above it: the god's logo and name in
   * the frame's colours. The timer bar hangs it between its own tabs; on a screen with no
   * timer the top bar hangs it alone.
   */
  import { team as teamNamed, type TeamId } from '../lib/teams'
  import TeamLogo from './TeamLogo.svelte'

  let { team }: { team: TeamId } = $props()
</script>

<span class="badge" data-team={team}>
  <span class="symbol"><TeamLogo {team} /></span>
  <span>{teamNamed(team).name}</span>
</span>

<style>
  .badge {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0 0.55rem 0 0.4rem;
    background: var(--frame);
    color: var(--frame-ink);
    border: var(--border-width) solid var(--frame-dark);
    border-top: none;
    border-radius: 0 0 min(var(--radius), 6px) min(var(--radius), 6px);
    font-family: var(--font-display);
    font-size: 0.8rem;
    font-weight: 700;
    line-height: 1.5;
    white-space: nowrap;
  }

  /* The symbol is drawn in the god's own colour, so on the badge it needs an edge. */
  .symbol {
    display: flex;
    width: 1.1rem;
    height: 0.95rem;
    filter: drop-shadow(0 0 1px var(--frame-dark)) drop-shadow(0 1px 0 var(--frame-dark));
  }
</style>
