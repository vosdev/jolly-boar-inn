import type { Mode } from '../modes'
import type { FieldHints } from '../placeholders'
import type { Sample } from '../samples'

export const mode: Mode = {
  id: 'who_said_that',
  label: 'Who Said That?',
  hint: 'Name the character behind the line.',
  host: { id: 'cracked_jennys_tea_cup', name: "Cracked Jenny's Tea Cup" },
  greeting: 'Squawk! Careful with the teacup, there’s a parrot listening in!',
  blurb:
    'I sit on shoulders in every tavern from Port Sarim to Mos Le’Harmless and repeat whatever I overhear. Tell me who said it first!',
  ask: [
    'Squawk! Overheard this at the bar - who said it?',
    'Polly heard a rumour! Whose voice is this?',
    'Pieces of eight! Who goes around saying this?',
    'Squawk! Heard this on my perch. Name the speaker!',
    'Who said that? Who said that? Tell the bird!',
  ],
  waiting: [
    'Preening my feathers while the slowpokes think. Squawk!',
    'Got a Karamjan banana while we wait? Or a cracker?',
    'Don’t tap on the teacup! The others are still thinking.',
    'Polly’s waiting... waiting... somebody toss me a peanut!',
    'Squawk! Five gp says half the table guesses wrong!',
  ],
  pace: {
    quick: [
      'Squawk! Faster than a seagull stealing a kebab!',
      'Sharp ears! You recognized that voice right away!',
      'Quick on the perch! Polly’s impressed!',
      'Straight in! You eavesdrop even more than I do!',
    ],
    middling: [
      'Tucked your answer under your wing. Now we wait!',
      'A sensible bird doesn’t flap in a hurry. Squawk!',
      'Heard you loud and clear! Waiting on the rest of the flock.',
    ],
    late: [
      'Squawk! Flew in just in time before the cage door shut!',
      'Chose your perch just in time - Polly nearly dozed off!',
      'Just in time! One more second and you’d have missed the boat!',
    ],
    early: [
      'Squawk! Barely chirped the first word and you knew it!',
      'Early bird gets the worm, and the points!',
      'Didn’t even need the whole quote! Sharp beak on you!',
    ],
    later: [
      'Cocked your head and listened twice. Smart bird!',
      'Took a long squint at the chatbox first, eh?',
      'Slow flapper, but you got there in the end! Squawk!',
    ],
  },
  reveal: [
    'Squawk! Here’s who said it!',
    'A little bird told me!',
    'Out of the horse’s mouth!',
    'Pieces of eight! The speaker:',
  ],
  verdict: {
    right: [
      'Squawk! Spot on! Have a cracker, matey!',
      'Clever bird! You know every voice in Gielinor!',
      'Right you are! Polly tips her teacup to you!',
      'Dead right! You’ve been reading the dialogue boxes!',
    ],
    partial: [
      'Half a cracker for you! Close, very close!',
      'Nearly had it! Right tavern, wrong loudmouth!',
      'Squawk! Close enough for a nibble of seed!',
    ],
    wrong: [
      'Squawk! Wrong! Have you been holding spacebar through quests?',
      'No cracker for you! They never said a word of that!',
      'Squawk! Dead wrong - even a drunken pirate knows better!',
      'Bawk! Did you play with your chatbox minimized?',
    ],
    missed: [
      'Cat got your tongue? Not even a squawk from you!',
      'Silent as a stuffed parrot! Did you fall off your perch?',
      'Nothing?! Polly can’t repeat silence, matey!',
    ],
  },
  stem: 'quote',
}

export const hints: FieldHints = {
  prompt: 'Who said this?',
  explanation: 'The Lumbridge Cook, who needs an egg, milk and flour for the Duke’s birthday cake.',
}

export const sample: Sample = {
  mode: 'who_said_that',
  type: 'multiple_choice',
  view: {
    quote: 'What am I to do?',
    options: ['The Cook', 'Duke Horacio', 'Father Aereck', 'Hans'],
  },
  answer: 0,
}
