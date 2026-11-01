/** Example text for a form's question and explanation fields, per round. */
export interface FieldHints {
  prompt: string
  explanation: string
}

const FALLBACK: FieldHints = {
  prompt: 'The question as players read it, such as Which skill trains with a tinderbox?',
  explanation: 'Why the answer is right, per the OSRS Wiki.',
}

const HINTS: Record<string, FieldHints> = {
  guess_examine: {
    prompt: 'It wasn’t a rock... it was a rock lobster!',
    explanation: '',
  },
  scaperune: {
    prompt: 'Zaff, or for an order, one entry per line',
    explanation: 'Zaff sells battlestaves. Aubury has the runes and Lowe the bows.',
  },
  odd_one_out: {
    prompt: '',
    explanation: 'The others are catalytic runes. Fire is an elemental rune.',
  },
  bestiary: {
    prompt: 'What race is General Graardor?',
    explanation: 'An ourg, and the only known living one, per his OSRS Wiki page.',
  },
  drop_table: {
    prompt: 'Which boss drops a Jar of miasma?',
    explanation: 'Abyssal Sire, through the Unsired it drops, per the OSRS Wiki.',
  },
  minigame_madness: {
    prompt: 'Which minigame gives the Ash covered tome?',
    explanation: 'Volcanic Mine: Petrified Pete sells it for 40,000 points.',
  },
  who_said_that: {
    prompt: 'Who said this?',
    explanation:
      'The Lumbridge Cook, who needs an egg, milk and flour for the Duke’s birthday cake.',
  },
  know_your_content_creator: {
    prompt: 'In Deadman Mansions, who captained TeamLUL?',
    explanation: 'Faux. B0aty captained TeamCBS, and Torvesta and Sick Nerd played under Faux.',
  },
  sort_it_out: {
    prompt: 'Sort these bosses by release date, from oldest to newest.',
    explanation:
      'Zulrah came out on 8 January 2015, Vorkath on 4 January 2018 and Nex on 5 January 2022.',
  },
  release_order: {
    prompt: 'Sort these updates by release date, from oldest to newest.',
    explanation: 'Dates come from the OSRS Wiki’s update history.',
  },
}

/** The hints for `mode`, or generic ones for a random event, a custom question or no round. */
export function fieldHints(mode: string): FieldHints {
  return HINTS[mode] ?? FALLBACK
}
