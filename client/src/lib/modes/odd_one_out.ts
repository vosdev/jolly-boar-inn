import type { Mode, SuggestCard } from '../modes'
import type { FieldHints } from '../placeholders'
import type { Sample } from '../samples'

export const mode: Mode = {
  id: 'odd_one_out',
  label: 'Odd One Out',
  hint: 'All alike but one. Spot the odd one out.',
  host: { id: 'dunce', name: 'Dunce' },
  greeting: "I'm in the corner for getting it wrong. Let's see if you do better.",
  blurb:
    'Most of these belong together. One does not. Find it before Mr. Mordaut punishes me again!',
  ask: [
    "One of these is like me: it doesn't fit.",
    "Find the one that doesn't belong here.",
    'I picked the wrong one last time. Your turn.',
    'Something here belongs in the corner with me.',
    'All of these belong together except one. Which?',
  ],
  waiting: [
    "Take your time. Nobody's letting me out of this corner anyway.",
    "Don't look at me for a hint, I'm wearing the pointy hat.",
    "I'm counting the bricks in the wall while the others finish.",
    'Mr. Mordaut is watching. Pretend you’re thinking hard.',
  ],
  pace: {
    quick: [
      "Whoa, so quick! I'm still sounding out the first word.",
      "Fast! I'd still be counting on my fingers.",
      'Show-off! How did you spot it that fast?',
      'Already?! Save some brains for the rest of us.',
    ],
    middling: [
      'Not bad, quicker than me anyway.',
      'Finished at normal-person speed. Must be nice.',
      'Answer’s in! You didn’t even have to guess, did you?',
    ],
    late: [
      "Just in time! That's usually when I panic and guess C.",
      'Phew, got it in just in time! My palms were sweating for you.',
      'Just in time! Right before the chalk hit the blackboard.',
    ],
    early: [
      "So early! I hadn't even finished reading the options.",
      'Instant pick! Are you actually sure, or pulling a me?',
      'Barely looked at it! You must sit in the front row.',
    ],
    later: [
      'Stared at it a long time. Story of my life.',
      'Had to squint at all four of them, huh? Me too.',
      'Slow and steady. Better than a trip to the corner.',
    ],
  },
  reveal: [
    "Told you it didn't fit.",
    'That one goes in the corner.',
    "Even I'd have spotted that.",
    'The odd one out:',
  ],
  verdict: {
    right: [
      'You got it! Can I copy off your slate next round?',
      "Spot on! You'll never have to wear the pointy hat.",
      'Correct! I wish I knew half of what you know.',
      'Nailed it! Don’t tell the teacher I helped.',
    ],
    partial: [
      "Half right! Honestly, I'd frame that and hang it on the wall.",
      'Almost! Only half a trip to the corner for you.',
      'Close enough! Better than my usual zero.',
    ],
    wrong: [
      'Wrong! Budge over, I’ll make room for you in the corner.',
      "Hey, that's the exact one I picked! Wait, that's bad.",
      'Oops. I have a spare dunce hat if you want it.',
      'Nope! Welcome to the back of the classroom, friend.',
    ],
    missed: [
      "No answer? Honestly, sometimes that's safer than guessing.",
      'Left it blank? I tried that once and still ended up in the corner.',
      'Daydreaming out the window? I do that every lesson.',
    ],
  },
  // The question is the same line each time; the names below it are all there is to read.
  stem: 'text',
}

export const hints: FieldHints = {
  prompt: '',
  explanation: 'The others are catalytic runes. Fire is an elemental rune.',
}

export const sample: Sample = {
  mode: 'odd_one_out',
  type: 'multiple_choice',
  view: {
    prompt: 'Which one is not a Barrows brother?',
    options: ['Dharok', 'Karil', 'Hazeel', 'Verac'],
  },
  answer: 2,
}

export const card: SuggestCard = { place: 5 }
