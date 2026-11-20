import type { Mode, SuggestCard } from '../modes'
import type { FieldHints } from '../placeholders'
import type { Sample } from '../samples'

export const mode: Mode = {
  id: 'uris_unravelling',
  label: 'Uri’s Unravelling',
  hint: 'Can you actually solve the clue without the help of a blinking yellow arrow?',
  host: { id: 'uri', name: 'Uri' },
  greeting: 'I once named a duck after a girl. Big mistake.',
  blurb:
    'No RuneLite plugin or blinking yellow arrow to save you here. Just the clue scroll, your wits, and a man in a bowler hat.',
  ask: [
    'Put on your rune heraldic helm and unravel this.',
    'No yellow arrow for this step. Read the scroll.',
    'The Double Agent is down. Now solve this clue.',
    'Do a jig, equip your spade, and tell me this.',
    'Unravel this cipher before my smoke bomb clears.',
  ],
  waiting: [
    'Want to see me bend a spoon while the others finish thinking?',
    'Standing in the Kharidian Desert in a bowler hat builds patience.',
    'The others are still searching their bank for a mitre and a crozier.',
    "Don't mind me. I'm just waiting to vanish in a puff of smoke.",
  ],
  pace: {
    quick: [
      'Solved in a heartbeat, and without a clue helper plugin!',
      'Faster than a spade on a one-tick dig!',
      'Quick work, comrade. The Double Agent didn’t even finish spawning.',
      "Instant decode! You've memorized every anagram in Gielinor.",
    ],
    middling: [
      'Checked your sextant and chart at a measured pace.',
      'Unravelled cleanly. Keep your briefcase close while we wait.',
      'Steady work. Nobody had to trek back to the bank for a headband.',
    ],
    late: [
      'Finished the emote just in time before I vanished in smoke!',
      'Dug up the casket with a tick to spare!',
      'Cut it close — my smoke bomb was already in my hand.',
    ],
    early: [
      'Didn’t even need to read the second half of the riddle!',
      'Solved on the first glance! Have you done a thousand hard clues?',
      'You already had the emote items in your inventory, didn’t you?',
    ],
    later: [
      'Counted the letters on your fingers for the anagram? Sensible.',
      'Better to read the coordinates twice than dig up the wrong patch.',
      'Took your time. Probably forgot your spade at the bank.',
    ],
  },
  reveal: [
    'Open the casket.',
    "Here's what the scroll meant.",
    'Loser says what.',
    'The cipher unravels:',
  ],
  verdict: {
    right: [
      'Correct. Take your casket, may it be Ranger boots, not firelighters.',
      'Solved, and not a blinking yellow arrow in sight.',
      'Well solved. I shall vanish in a puff of smoke now.',
      'Third-age material! You know your Treasure Trails by heart.',
    ],
    partial: [
      'Right coordinates, wrong step: you forgot to equip rune platelegs.',
      'Close! One pace off the dig spot.',
      'Half solved. You brought the crozier but forgot the headband.',
    ],
    wrong: [
      'Wrong spot! You just dug up an empty patch in the Wilderness.',
      'Incorrect. Enjoy your reward of 14 purple sweets and a longbow.',
      'No! Turn your clue plugin off more often, your skills are rusty.',
      'Wrong emote! Now the Double Agent is back for round two.',
    ],
    missed: [
      'Forgot to bring a spade? You stood there and never dug!',
      'No answer at all. The Double Agent knocked you back to Lumbridge.',
      'Silence? Even a mime clue requires an emote.',
    ],
  },
  stem: 'quote',
}

export const hints: FieldHints = {
  prompt: 'Which NPC is this anagram for?',
  explanation: 'Ranael, who runs the skirt shop in Al Kharid.',
}

export const sample: Sample = {
  mode: 'uris_unravelling',
  type: 'multiple_choice',
  view: {
    prompt: 'Which NPC does this anagram name?',
    quote: 'AN EARL',
    options: ['Aretha', 'Ranael', 'Baraek', 'Kaylee'],
  },
  answer: 1,
}

export const card: SuggestCard = { place: 11 }
