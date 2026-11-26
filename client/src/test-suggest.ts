/**
 * For the component tests: Suggest as the router mounts it, its `navigate` moving it to
 * the card the address names as `App.svelte` would. `spy` sees every address it goes to.
 */
import { render } from '@testing-library/svelte'

import { cardInPath } from './lib/suggestPath'
import Suggest from './routes/Suggest.svelte'

export function renderSuggest(
  card: string | null = null,
  spy: (to: string) => void = () => {},
): ReturnType<typeof render<typeof Suggest>> {
  const view = render(Suggest, {
    card,
    navigate: (to: string) => {
      spy(to)
      const next = cardInPath(to)
      if (next !== undefined) void view.rerender({ card: next })
    },
  })
  return view
}
