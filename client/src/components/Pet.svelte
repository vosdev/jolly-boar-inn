<script lang="ts">
  /**
   * One pet, as its chathead or its icon, in a square box `size` pixels on a side: a
   * chathead is anything from 28 to 200 pixels, an icon about 30, and `PixelArt` fits it.
   */
  import { avatarArt, petName, type PetCut } from '../lib/pets'
  import PixelArt from './PixelArt.svelte'

  let {
    pet,
    size = 32,
    cut = 'chathead',
    label = null,
  }: {
    pet: string
    size?: number
    cut?: PetCut
    /** Read out instead of the pet's name. Empty for a pet beside a name that says it all,
        which a screen reader then skips. */
    label?: string | null
  } = $props()

  const art = $derived(avatarArt(pet, cut))
</script>

<span
  class="pet"
  data-pet={pet}
  role={label === '' ? undefined : 'img'}
  aria-label={label === '' ? undefined : (label ?? petName(pet))}
  aria-hidden={label === '' ? 'true' : undefined}
  style:width="{size}px"
  style:height="{size}px"
>
  <PixelArt src={art.url} {size} />
</span>

<style>
  .pet {
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;
    vertical-align: middle;
  }
</style>
