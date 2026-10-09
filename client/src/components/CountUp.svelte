<script lang="ts">
  /** A number that counts to each new value rather than jumping to it. */
  import { cubicOut } from 'svelte/easing'
  import { Tween } from 'svelte/motion'

  let { value, duration = 700 }: { value: number; duration?: number } = $props()

  const shown = Tween.of(() => value, { duration: () => duration, easing: cubicOut })
  const numbers = new Intl.NumberFormat()
</script>

{numbers.format(Math.round(shown.current))}
