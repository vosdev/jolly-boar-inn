<script lang="ts">
  /**
   * A quiet band under every screen, the top bar's twin: the trademark notice, what is and
   * is not collected, the way to the source, the licence, where the data comes from, and the
   * version. The operator's browser, the one holding the admin token, gets a way into Admin too.
   *
   * It sits in the page's flow, never fixed, so on a long screen it is below the last
   * answer rather than over it, and on a short one the shell pushes it to the bottom.
   */
  import Icon from './Icon.svelte'
  import { hasAdminToken } from '../lib/admin'
  import { LICENSE_URL, RELEASE_URL, REPO_URL, VERSION_LABEL, WIKI_URL } from '../lib/links'

  /** The screen above uses the wide page, so the footer's text follows it. */
  let { wide = false, navigate }: { wide?: boolean; navigate: (to: string) => void } = $props()

  const admin = hasAdminToken()
</script>

<footer class="footer">
  <div class="inner" class:wide>
    <p>RuneScape and RuneScape Old School are the trademarks of Jagex Limited.</p>
    <p>We count games and rounds per day. No cookies, no personal data.</p>
    <ul>
      <li>
        <a class="repo" href={REPO_URL} target="_blank" rel="noopener">
          <Icon name="github" />
          Source on GitHub
        </a>
      </li>
      <li><a href={LICENSE_URL} target="_blank" rel="noopener">AGPL-3.0</a></li>
      <li>
        <a href={WIKI_URL} target="_blank" rel="noopener">Data from the OSRS Wiki</a> (CC BY-NC-SA)
      </li>
      <li>
        <a class="version" href={RELEASE_URL} target="_blank" rel="noopener">v{VERSION_LABEL}</a>
      </li>
      {#if admin}
        <li><button type="button" class="small" onclick={() => navigate('/admin')}>Admin</button></li>
      {/if}
    </ul>
  </div>
</footer>

<style>
  /* The bar's edge, drawn the same way: a shadow, mirrored onto the top. */
  .footer {
    background: var(--panel);
    box-shadow: 0 calc(-1 * var(--border-width)) 0 var(--line);
    color: var(--muted);
    font-size: 0.8rem;
    line-height: 1.4;
  }

  /* The screens' column, so the text lines up with the panels above it. */
  .inner.wide {
    width: min(var(--page-wide), 100% - 2rem);
  }

  .inner {
    width: min(var(--page-width), 100% - 2rem);
    margin-inline: auto;
    padding: 1rem 0 1.5rem;
  }

  p {
    margin: 0 0 0.25rem;
  }

  ul {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.25rem 1rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  a {
    color: inherit;
  }

  .repo {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
  }
</style>
