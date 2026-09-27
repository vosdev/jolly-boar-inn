/**
 * How `more_less` words each metric: in the question on the scroll (`MoreLessStem`), and
 * in the reveal's footnote under it (`MoreLess`). One table, so a metric added later
 * cannot end up phrased in the question and nameless on the reveal, or the other way round.
 */

export interface Phrasing {
  /** Verb for "Which … MORE": a price is something an item costs, alchemy is worth. */
  verb: string
  /** Where the value comes from, e.g. `on the Grand Exchange`. Empty reads as before. */
  source: string
  /** The noun the reveal footnote names it by. */
  label: string
}

const METRICS: Record<string, Phrasing> = {
  ge_price: {
    verb: 'costs',
    source: 'on the Grand Exchange',
    label: 'Grand Exchange price',
  },
  high_alch: {
    verb: 'is worth',
    source: 'through High Alchemy',
    label: 'high alchemy value',
  },
  shop_price: { verb: 'costs', source: 'in a shop', label: 'shop price' },
}

/**
 * A metric's phrasing. A room can be playing a pack written against a newer schema than
 * this client knows, so an unknown metric still has to ask something: the bare question,
 * and the raw id on the reveal.
 */
export function phrasingFor(metric: string): Phrasing {
  return METRICS[metric] ?? { verb: 'costs', source: '', label: metric }
}
