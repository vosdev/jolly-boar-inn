import { HOUSE } from '../house'
import type { Mode } from '../modes'

// Never a round either: the NPCs' own questions, each asked by the NPC it was written
// for (`lib/randomEvents.ts`, `components/RandomEvent.svelte`). Here for its stem.
export const mode: Mode = {
  id: 'random_event',
  label: 'Random Event',
  hint: 'An NPC interrupts the round with a question of their own.',
  host: HOUSE,
  greeting: 'Someone has come in off the road, and they want a word.',
  blurb: 'Someone has turned up with a question. Answer it, and they will be on their way.',
  ask: [
    "Someone's come in off the road.",
    'A visitor has a question for the table.',
    'Hear out our guest before they vanish!',
  ],
  waiting: [
    "They'll be on their way once the rest of the table answers.",
    'Our visitor is tapping their foot waiting on the others.',
    'Nearly done with our unexpected guest.',
  ],
  pace: {
    quick: [
      'Quick! Our visitor barely finished spawning.',
      'Fast! Handled like a pro.',
      'Straight in! No XP waste on this interruption.',
    ],
    middling: [
      'Answered in good time. Our guest nods.',
      'A steady answer. Now we wait on the rest of the table.',
      'Sorted without a fuss.',
    ],
    late: [
      'Just in time! Our visitor was about to despawn.',
      'Got that in just in time before the door shut!',
      'Answered just in time - nearly missed your reward!',
    ],
    early: [
      'Answered before the smoke even cleared!',
      'So early! Our guest had barely opened their mouth.',
      'Instant answer! You know this visitor well.',
    ],
    later: [
      'Let them finish their whole speech first. Good manners.',
      'Took your time sizing up our visitor.',
      'Thought it over carefully before answering our guest.',
    ],
  },
  reveal: ['And off they go.', 'Back on the road with them.', 'Mind the door on your way out.'],
  verdict: {
    right: [
      'Our guest liked that answer! Enjoy the reward.',
      "Spot on! They'll leave you in peace with a prize.",
      'Correct! Off they go, happy as can be.',
    ],
    partial: [
      "Half an answer. They'll let you off with a warning.",
      'Close enough for a passing stranger.',
      'Nearly! Our guest shrugs and hands over half credit.',
    ],
    wrong: [
      'Wrong! Lucky they didn’t teleport you across Gielinor.',
      "Not what our visitor wanted to hear, I'm afraid.",
      'Incorrect! Our guest shakes their head and vanishes.',
    ],
    missed: [
      'Ignored our visitor completely! That’s how you get frog-ported.',
      'No answer at all. Our guest wandered off muttering.',
      'Left our visitor hanging in awkward silence.',
    ],
  },
  // In character, and still a sentence.
  stem: 'text',
}
