<script lang="ts">
  /**
   * One line of the scroll typing itself in from the moment it mounts, `from` ms on, at the
   * scroll's 50 letters a second; whole under reduced motion. Key it on the line to type
   * a new one.
   */
  import { untrack } from 'svelte'

  import { SETTLED, interludeFor, reducedMotion } from '../../lib/interlude'
  import { Typist, lettersOf, type Line } from '../../lib/typing.svelte'
  import Typed from './Typed.svelte'

  let { line, from = 0 }: { line: Line; from?: number } = $props()

  const letters = $derived([lettersOf(line)])
  const typist = new Typist(
    () => letters,
    untrack(() => (reducedMotion() ? SETTLED : interludeFor(Infinity, letters, from, from))),
    Date.now(),
  )
</script>

<Typed {line} shown={typist.shown[0]} />
