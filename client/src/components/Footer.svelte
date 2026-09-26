<script lang="ts">
  /**
   * One quiet line under every screen: the trademark notice, the way to the source, the
   * licence, where the data comes from, and the version.
   *
   * It sits in the page's flow, never fixed, so on a long screen it is below the last
   * answer rather than over it, and on a short one the shell pushes it to the bottom.
   */
  import { LICENSE_URL, RELEASE_URL, REPO_URL, VERSION_LABEL, WIKI_URL } from '../lib/links'
</script>

<footer class="footer">
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
</footer>

<style>
  .footer {
    width: min(42rem, 100% - 2rem);
    margin-inline: auto;
    padding: 1rem 0 1.5rem;
    color: var(--bg-muted);
    font-size: 0.8rem;
    line-height: 1.4;
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
