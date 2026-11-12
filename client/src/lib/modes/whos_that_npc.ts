import type { Mode, SuggestCard } from '../modes'
import type { Sample } from '../samples'

export const mode: Mode = {
  id: 'whos_that_npc',
  label: 'Who is That NPC?',
  hint: "It's Elvarg!",
  host: { id: 'postie_pete', name: 'Postie Pete' },
  greeting: 'Parcel for you! Smudged address, mind - all I’ve got is a silhouette.',
  blurb:
    "Everyone in Gielinor gets post from me. I'll show you their shadow; you tell me whose letterbox it goes in.",
  ask: [
    "Parcel with no name on it! Who's this one for?",
    'Only a silhouette on the envelope. Who is it?',
    'Special delivery! Whose shadow have we got here?',
    'Help a postie out: who am I delivering this to?',
    "I've seen this outline on my rounds. Who is it?",
  ],
  waiting: [
    'Hang on, still rummaging through the bottom of my mailbag.',
    'Waiting on the rest of the street to answer the door.',
    'Careful, don’t let a highwayman nick the parcels while we wait.',
    'Still sorting the Varrock post from the Falador post.',
  ],
  pace: {
    quick: [
      'First-class express! Faster than a teleport tab.',
      'Delivered in a flash! You know every face on my route.',
      'Stamped and sorted before the ink even dried!',
      'Rapid! Evil Bob could use a courier as quick as you.',
    ],
    middling: [
      'Delivered on the afternoon round, steady and reliable.',
      'Popped through the letterbox in good time.',
      'Nice brisk walking pace. My skeletal feet approve.',
    ],
    late: [
      'Caught the last post of the day just in time!',
      'Slipped it under the door just in time before closing!',
      'Just in time! The mail cart was already rolling out of town.',
    ],
    early: [
      'Barely saw the outline of their hat and you knew them!',
      'Recognized them from down the street! Sharp eyes.',
      'Sorted before the sack even hit the table!',
    ],
    later: [
      'Had to squint at the silhouette in the candlelight first?',
      'Checked the postcode twice before knocking. Sensible.',
      'Took a long look at the shadow. Better than wrong delivery!',
    ],
  },
  reveal: [
    'Signed, sealed, delivered!',
    "Here's who answered the door.",
    'Let’s read the name tag.',
    'Special delivery for:',
  ],
  verdict: {
    right: [
      'Right letterbox, first try! Signed for and everything.',
      'Spot on! You know more locals than I do.',
      'Delivered! Not a single parcel lost in the post.',
      'Bang on the address! Worthy of a tip.',
    ],
    partial: [
      'Right street, wrong house! Close enough to toss over the fence.',
      'Nearly! The neighbour can walk it over for them.',
      'Half right. At least it landed in the right kingdom.',
    ],
    wrong: [
      'Return to sender! That looks nothing like them.',
      'Wrong door! You just handed Elvarg’s post to a goblin.',
      'No such person at this address! Back in the sack it goes.',
      'Misdelivered! That’s going to end up in the Dead Letter Office.',
    ],
    missed: [
      'Knocked three times and nobody came to the door!',
      'Left a "Sorry we missed you" card on your table.',
      'No signature from you. Parcel goes back to the depot.',
    ],
  },
  // The prompt is the same line every time, which the host's ask line says; the picture
  // alone is the question.
  stem: null,
}

export const sample: Sample = {
  mode: 'whos_that_npc',
  type: 'pick_from_list',
  view: { prompt: "Who's that NPC?", vocab: 'npcs' },
  answer: 817,
  subject: { name: 'Elvarg' },
}

export const card: SuggestCard = { place: 13 }
