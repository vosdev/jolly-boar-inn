<script lang="ts">
  /**
   * One pet, as its chathead or its icon, in a square box `size` pixels on a side.
   *
   * The art comes in every shape — a chathead is anything from 28 to 200 pixels, an icon is
   * about 30 — so the box is the contract and the picture is fitted into it, centred. A
   * picture smaller than the box is drawn at a whole number of screen pixels per art pixel
   * with hard edges, since a smoothing filter smears art this small; a bigger one is
   * scaled down smoothly, since nearest-neighbour shrinking tears it. Until the file has
   * loaded its size is unknown, and the box simply holds its place.
   */
  import { avatarArt, petName, type PetCut } from '../lib/pets'

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
  let natural = $state<{ w: number; h: number } | null>(null)

  const fit = $derived.by(() => {
    if (natural === null || natural.w === 0 || natural.h === 0) return null
    const ratio = Math.min(size / natural.w, size / natural.h)
    const scale = ratio >= 1 ? Math.floor(ratio) : ratio
    return { w: natural.w * scale, h: natural.h * scale, crisp: ratio >= 1 }
  })

  function loaded(event: Event): void {
    const img = event.currentTarget as HTMLImageElement
    natural = { w: img.naturalWidth, h: img.naturalHeight }
  }
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
  <img
    src={art.url}
    alt=""
    draggable="false"
    class:crisp={fit?.crisp}
    style:width={fit === null ? undefined : `${fit.w}px`}
    style:height={fit === null ? undefined : `${fit.h}px`}
    onload={loaded}
  />
</span>

<style>
  .pet {
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;
    vertical-align: middle;
  }

  .pet img {
    display: block;
    max-width: 100%;
    max-height: 100%;
    /* A tap on a pet is a tap on whatever it sits in: the chip, a row, a grid cell. */
    pointer-events: none;
    user-select: none;
  }

  .pet img.crisp {
    image-rendering: pixelated;
  }
</style>
