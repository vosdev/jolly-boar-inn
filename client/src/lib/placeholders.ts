/** Example text for a form's question and explanation fields, per round. */
export interface FieldHints {
  prompt: string
  explanation: string
}

const FALLBACK: FieldHints = {
  prompt: 'e.g. Which skill do you train with a tinderbox?',
  explanation: 'Optional context shown on the reveal, e.g. why the answer is right.',
}

const HINTS: Record<string, FieldHints> = {
  guess_examine: {
    prompt: 'It wasn’t a rock... it was a rock lobster!',
    explanation: '',
  },
  forgetful_bard: {
    prompt: 'Seventy Attack, and hear it crack: an Abyss-born lash on a demon’s back.',
    explanation: '',
  },
  scaperune: {
    prompt: 'e.g. Zaff (or one entry per line for an ordered list)',
    explanation: 'Zaff sells battlestaves. Aubury has the runes and Lowe the bows.',
  },
  odd_one_out: {
    prompt: '',
    explanation: 'The others are catalytic runes. Fire is an elemental rune.',
  },
  bestiary: {
    prompt: 'What race is General Graardor?',
    explanation: 'General Graardor is the last living ourg.',
  },
  drop_table: {
    prompt: 'Which boss drops a Jar of miasma?',
    explanation: 'Dropped by the Abyssal Sire via the Unsired.',
  },
  minigame_madness: {
    prompt: 'Which minigame gives the Ash covered tome?',
    explanation: 'Volcanic Mine: Petrified Pete sells it for 40,000 points.',
  },
  tales_of_gielinor: {
    prompt: 'Who gives you the Lost City quest?',
    explanation: 'The Warrior camped in Lumbridge Swamp is searching for Zanaris.',
  },
  uris_unravelling: {
    prompt: 'Which NPC is this anagram for?',
    explanation: 'Ranael, who runs the skirt shop in Al Kharid.',
  },
  slayer_master: {
    prompt: 'Which item do you need to kill a rockslug?',
    explanation: 'Rockslugs need a bag of salt to finish them off at low HP.',
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
