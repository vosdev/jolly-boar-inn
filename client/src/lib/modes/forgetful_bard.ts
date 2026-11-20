import type { Mode, SuggestCard } from '../modes'
import type { FieldHints } from '../placeholders'
import type { Sample } from '../samples'

export const mode: Mode = {
  id: 'forgetful_bard',
  label: 'The Forgetful Bard',
  hint: "He's forgotten what this verse was about. Can you help him out?",
  host: { id: 'falo', name: 'Falo the Bard' },
  greeting: "Ah, a crowd! I remember the song, just not which item it's about.",
  blurb:
    "I'll sing you a verse about an iconic item, if only I could remember which one. Find it on the list to jog my memory.",
  ask: [
    'Listen to the verse. Which item is it about?',
    'Right on the tip of my tongue! Name the item.',
    'Show me the item from this ballad, friend!',
    'I wrote this song, yet the item escapes me...',
    'A verse from my travels: what item is it about?',
  ],
  waiting: [
    'Let me tighten a string on my lyre while the others think.',
    'The rest of the tavern is still humming the melody.',
    'Wait a moment, don’t spoil the chorus for the others!',
    'It gets chilly on the road to Rellekka waiting for an audience.',
  ],
  pace: {
    quick: [
      'Before the first chord even faded! What a memory you have!',
      'You knew the ballad from the very first line!',
      'Faster than a bard chasing a gold coin!',
      'Named it on the downbeat! My memory is saved!',
    ],
    middling: [
      'Right on the rhythm, neither rushing the tempo nor dragging.',
      'Answered by the end of the verse. Now we wait for the chorus.',
      'A pleasant tempo! Let the rest of the crowd finish listening.',
    ],
    late: [
      'Got it in on the very last strum of the lyre!',
      'Just in time! The ballad was fading into the final note.',
      'Remembered it right before the encore ended!',
    ],
    early: [
      'You named it before I even reached the rhyming line!',
      'Barely plucked a single string and you knew the item!',
      'So early! Have you heard me sing this on the Rellekka road before?',
    ],
    later: [
      'Listened to the whole verse twice to be sure. A polite audience.',
      'Let the lyrics sink in first. Good poetry deserves a moment.',
      'Took your time with the riddle. Better sure than out of tune!',
    ],
  },
  reveal: [
    'Ah yes, now I remember!',
    'Of course! That was the item!',
    'The ballad comes back to me:',
    'How could I forget?',
  ],
  verdict: {
    right: [
      'Yes, that’s the one! Seeing it brings the whole song back to me!',
      'Bravo! You know my repertoire better than I do!',
      'Take your clue scroll before I forget the next verse too!',
      'That is the very item! My lyre sings for you, friend!',
    ],
    partial: [
      'Close! Right melody, slightly the wrong verse.',
      'Nearly had it, it would almost fit the metre!',
      'Half right! My own memory is no better today.',
    ],
    wrong: [
      'No, no! That doesn’t fit the rhyme or the legend at all!',
      'Wrong item! Singing about that would clear the whole tavern.',
      "Alas, a sour note! That's not what the verse was about.",
      "Not even close, friend. Now you've got me even more confused!",
    ],
    missed: [
      'Dead silence from the crowd? A bard’s worst nightmare!',
      'Not a single guess? Now neither of us knows how the song ends!',
      'You stood there like a Rellekka rock crab and said nothing!',
    ],
  },
  stem: 'text',
  // The verse is the question; the picture would be its answer.
}

export const hints: FieldHints = {
  prompt: 'Seventy Attack, and hear it crack: an Abyss-born lash on a demon’s back.',
  explanation: '',
}

export const sample: Sample = {
  mode: 'forgetful_bard',
  type: 'pick_from_list',
  view: {
    prompt: "Seventy Attack, and hear it crack: an Abyss-born lash on a demon's back.",
    vocab: 'items',
  },
  answer: 4151,
  subject: { name: 'Abyssal whip' },
}

export const card: SuggestCard = { place: 14, hint: 'A verse about an item, for Falo to sing.' }
