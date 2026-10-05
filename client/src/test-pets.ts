/**
 * For the component tests: which pet a rendered `<Pet>` shows, and in what size of box.
 * The art files are not committed, so a test cannot read the picture back; the box says
 * which pet it was asked for.
 */

export interface Drawn {
  pet: string
  size: number
}

/** Every pet drawn under `root`, in document order. */
export function petsDrawn(root: ParentNode): Drawn[] {
  return [...root.querySelectorAll<HTMLElement>('.pet')].map((box) => ({
    pet: box.dataset.pet ?? '',
    size: parseFloat(box.style.width),
  }))
}
