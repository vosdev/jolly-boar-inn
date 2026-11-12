import type { Mode } from '../modes'
import type { FieldHints } from '../placeholders'
import type { Sample } from '../samples'

export const mode: Mode = {
  id: 'bestiary',
  label: 'Bestiary',
  hint: 'Combat levels, looks and haunts of the monsters.',
  host: { id: 'zoo_keeper', name: 'Zoo keeper' },
  greeting: 'Welcome to Ardougne Zoo! Keep your fingers outside the bars, some of these bite.',
  blurb:
    'From Lumbridge goblins to slayer cave horrors, I have notes on every creature in Gielinor. Let’s see how well you know your monsters.',
  ask: [
    'What do you make of this creature?',
    'Careful by the bars! What do you know about it?',
    'How well do you know this beast?',
    'Step up to the bars and tell me this.',
    'This monster is in my book. Do you know it?',
  ],
  waiting: [
    'Hang on, those two penguins by the rock are whispering again.',
    'Keep your hands off the unicorn cage while the others finish up.',
    'Just tossing a bucket of fish to the sea turtles while we wait.',
    'Check your bag - nobody smuggled a Karamjan monkey in here, right?',
    'Waiting on the rest of the tour group. Mind the cyclops!',
  ],
  pace: {
    quick: [
      'Faster than a startled chinchompa! You know your monsters.',
      'Quick as a pit-trap! You’ve fought plenty of those, haven’t you?',
      'Straight in! You didn’t even need the Monster Examine spell.',
      'Rapid! You could wrangle escaped penguins for a living.',
    ],
    middling: [
      'A steady pace, faster than a gnome tortoise at least.',
      'In at a comfortable trot. Let’s wait for the rest of the group.',
      'Answered without spooking the animals. Nice and calm.',
      'Got your answer in! The others are still squinting through the bars.',
    ],
    late: [
      'Slipped through the zoo gates just in time!',
      'Got that in just in time before feeding time started!',
      'Just in time! The scorpion nearly had your fingers.',
      'Right at closing bell, just in time!',
    ],
    early: [
      'Called it from a single footprint! Impressive.',
      'Barely saw the horns on it and you already knew!',
      'So early! Have you been keeping one of these in your POH menagerie?',
    ],
    later: [
      'Kept a safe distance and observed it first. Smart.',
      'Never poke a strange beast without checking its combat level first.',
      'Took a good long look through the bars. Can’t blame you.',
    ],
  },
  reveal: [
    'Let’s check the bestiary.',
    'What does the field guide say?',
    'Here’s the creature’s file.',
    'Back in its cage!',
  ],
  verdict: {
    right: [
      'Spot on! You know Gielinor’s wildlife better than Parroty Pete.',
      'Dead right! Toss a fish to the penguins on your way out.',
      'Correct! Even the cyclops is nodding at you.',
      'Nailed it! You’ve clearly spent some hours in the field.',
    ],
    partial: [
      'Close! You’d survive the encounter, maybe with a scratch or two.',
      'Mostly right, just don’t try petting it.',
      'Half marks! You’ve seen one before, even if you forgot the details.',
    ],
    wrong: [
      'Oof, no! Walk into its lair thinking that and you’re dragon food.',
      'Wrong beast entirely! Did a monkey write your notes?',
      'Not even close! Stay on the visitor path where it’s safe.',
      'Wrong! Even the sheep by the north fence knew that one.',
    ],
    missed: [
      'No answer? Did you wander off toward the Ardougne monastery?',
      'Frozen like a deer in a hellhound’s sights!',
      'Nothing from you. Too busy watching the penguins plot?',
    ],
  },
  // Every question names its monster in the sentence, whatever answers it below.
  stem: 'text',
}

export const hints: FieldHints = {
  prompt: 'What race is General Graardor?',
  explanation: 'General Graardor is the last living ourg.',
}

export const sample: Sample = {
  mode: 'bestiary',
  type: 'multiple_choice',
  view: {
    prompt: 'How many hitpoints does a Hill Giant have?',
    options: ['25', '35', '45', '60'],
  },
  answer: 1,
}
