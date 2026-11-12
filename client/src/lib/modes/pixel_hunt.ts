import type { Mode } from '../modes'
import type { Sample } from '../samples'

export const mode: Mode = {
  id: 'pixel_hunt',
  label: 'Pixel Hunt',
  hint: 'How fast can you recognize the item?',
  host: { id: 'sherlock', name: 'Sherlock' },
  greeting: 'Step up to the flax field. Let us see how sharp your eyes really are.',
  blurb:
    'I will reveal an item a few pixels at a time. Name it from the list before the full icon shows - the fewer pixels you need, the more points you earn.',
  ask: [
    'A new master challenge. What item is this?',
    'Squint at the pixels. Which item do you see?',
    'How many pixels do you need to name this item?',
    'Show me your bank knowledge. What item is this?',
    'Focus your eyes. Which item is taking shape?',
  ],
  waiting: [
    'Waiting on the others. Some folk still sort their bank by colour.',
    'Hold on, the rest of the room is still squinting at the pixels.',
    'I have stood by the Seers’ flax field for years; I can wait a bit.',
    'Still puzzling it out, the others. No Bloodhound pet for slow eyes.',
  ],
  pace: {
    quick: [
      'Spot-checked in a second! You know every sprite in your bank.',
      'Fast! You did not even need a magnifying glass.',
      'Completed the challenge before the second pixel pass!',
      'Razor-sharp! Worthy of a master clue casket.',
    ],
    middling: [
      'Named once the silhouette came together. Sensible.',
      'Challenge completed at a steady pace. Hand me your scroll.',
      'A clean identification. Let us wait on the rest of the room.',
    ],
    late: [
      'Named it just in time, with the full icon staring right at you!',
      'Completed the challenge just in time before your clue scroll tore!',
      'Got it in just in time! The last pixel was already in place.',
    ],
    early: [
      'From four giant squares of colour?! You stare at your bank too much.',
      'First-step snipe! Did you memorize the item database?',
      'Barely a smear of pixels and you called it! Extraordinary.',
    ],
    later: [
      'Waited until you could count the pixels on the handle. Safe play.',
      'No shame in waiting for the sharper pass. Wrong guesses pay zero.',
      'Let the picture come into focus first. A patient detective.',
    ],
  },
  reveal: [
    'Every pixel in place.',
    'Here is the full icon.',
    'Challenge complete:',
    'The item revealed:',
  ],
  verdict: {
    right: [
      'Spot on! Here is your challenge scroll back, marked complete.',
      'Flawless eye! One step closer to the Bloodhound.',
      'Correct! You know your inventory sprites inside out.',
      'Solved! Even Watson could not fault that eye.',
    ],
    partial: [
      'Right item family, wrong tier. Partial credit.',
      'Close! The colours fooled you on the early pass.',
      'Half credit. Squint a little harder next time.',
    ],
    wrong: [
      'Wrong item! Did you mistake a bronze med helm for a cabbage?',
      'Incorrect! Drop your master clue scroll and go train your eyes.',
      'Not even the right colour palette! Back to easy clues in HAM robes.',
      'Failed the challenge! Even a blurry pixel looked nothing like that.',
    ],
    missed: [
      'Stared at the pixels until the timer ran out and never picked one!',
      'No answer at all? Your master clue scroll just blew away.',
      'Left the challenge blank. No casket for you.',
    ],
  },
  // The prompt is the same line every time, which the host's ask line says; the picture
  // alone is the question.
  stem: null,
  picture: 'build',
}

export const sample: Sample = {
  mode: 'pixel_hunt',
  type: 'pick_from_list',
  view: { prompt: 'Which item is this?', vocab: 'items' },
  answer: 4151,
  subject: { name: 'Abyssal whip' },
  steps: { build: 17, of: 25 },
}
