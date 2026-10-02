<script lang="ts">
  /**
   * A quiet band under every screen, the top bar's twin: the trademark notice, the way to
   * the source, the licence, where the data comes from, and the version.
   *
   * It sits in the page's flow, never fixed, so on a long screen it is below the last
   * answer rather than over it, and on a short one the shell pushes it to the bottom.
   */
  import { LICENSE_URL, RELEASE_URL, REPO_URL, VERSION_LABEL, WIKI_URL } from '../lib/links'
</script>

<footer class="footer">
  <div class="inner">
    <p>RuneScape and RuneScape Old School are the trademarks of Jagex Limited.</p>
    <ul>
      <li><a href={REPO_URL} target="_blank" rel="noopener">Source on GitHub</a></li>
      <li><a href={LICENSE_URL} target="_blank" rel="noopener">AGPL-3.0</a></li>
      <li>
        <a href={WIKI_URL} target="_blank" rel="noopener">Data from the OSRS Wiki</a> (CC BY-NC-SA)
      </li>
      <li>
        <a class="version" href={RELEASE_URL} target="_blank" rel="noopener">v{VERSION_LABEL}</a>
      </li>
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
  .inner {
    width: min(42rem, 100% - 2rem);
    margin-inline: auto;
    padding: 1rem 0 1.5rem;
  }

  p {
    margin: 0 0 0.25rem;
  }

  ul {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 1rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  a {
    color: inherit;
  }
</style>
