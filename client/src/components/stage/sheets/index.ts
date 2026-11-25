/**
 * Every sheet `ClueScroll` can draw, by the `Sheet` `sheetFor` picks for the theme.
 *
 * A sheet draws its own pieces and is handed the shared paper to place among them:
 * `children(behind, over)` renders the paper with `behind` inside it, under the words,
 * and `over` on top of it. A sheet styles its paper only as `.scroll[data-sheet='<it>']`,
 * `.reveal` and `.paper`, and never pads them: the scroll's frame sets every sheet's
 * words in alike.
 */

import type { Component, Snippet } from 'svelte'

import type { Sheet } from '../../../lib/sheet'
import Bamboo from './Bamboo.svelte'
import Bunting from './Bunting.svelte'
import Gate from './Gate.svelte'
import Gravestone from './Gravestone.svelte'
import Poster from './Poster.svelte'
import Scroll from './Scroll.svelte'
import Sign from './Sign.svelte'
import Slab from './Slab.svelte'

export interface SheetProps {
  /** The paper, given what lies inside it under the words and what lies over it. */
  children: Snippet<[behind: Snippet | undefined, over: Snippet | undefined]>
}

export const SHEETS: Record<Sheet, Component<SheetProps>> = {
  scroll: Scroll,
  poster: Poster,
  bunting: Bunting,
  slab: Slab,
  bamboo: Bamboo,
  gate: Gate,
  gravestone: Gravestone,
  sign: Sign,
}
