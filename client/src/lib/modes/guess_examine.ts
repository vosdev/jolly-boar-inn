import type { Mode, SuggestCard } from '../modes'
import type { FieldHints } from '../placeholders'
import type { Sample } from '../samples'

export const mode: Mode = {
  id: 'guess_examine',
  label: 'Guess the Examine',
  hint: 'Identify the item, NPC, or object from its examine text.',
  host: { id: 'examiner', name: 'The Examiner' },
  greeting: 'Welcome to the Digsite exam hall. Have your trowel and specimen brush ready.',
  blurb:
    "Every true adventurer right-clicks and examines everything in sight. I'll read you an examine text — you tell me what it belongs to.",
  ask: [
    'What is this the examine of?',
    'Next specimen: what is this the examine of?',
    'Read the field notes: what is this the examine of?',
    'Which object in Gielinor has this examine text?',
    'Examine this closely: what is this the examine of?',
  ],
  waiting: [
    'Do not copy off your neighbour’s slate while we wait.',
    'The others are still brushing the dirt off their specimens.',
    'Quiet in the hall, please. Some candidates are still thinking.',
    'Wait for the rest of the dig team to hand in their notes.',
    'Patience. Good archaeology cannot be rushed with a pickaxe.',
  ],
  pace: {
    quick: [
      'Identified at a glance! You really do right-click everything.',
      'Remarkably quick! Have you been reading the wiki during lectures?',
      'First slate handed in! Level 3 Earth Sciences material.',
      'Instant recognition! You did not even need a magnifying glass.',
    ],
    middling: [
      'Logged in the field journal at a sensible pace.',
      'Careful brushwork, handed in on time.',
      'A methodical identification. Let us wait for the other candidates.',
      'Specimen tagged. Now we wait for the rest of the hall.',
    ],
    late: [
      'Handed your slate in just in time! The ink is still wet.',
      'Barely made it! I was already reaching for the red pen.',
      'Finished right before the dig site closed for the day!',
      "Scraped through at the bell! Don't cut it so close next question.",
    ],
    early: [
      'Barely dusted the soil off and you already named it!',
      'An early identification. Confident in your field notes?',
      'Tagged before the rest of the hall even picked up their brushes.',
    ],
    later: [
      'Inspected it from every angle first. Very thorough.',
      'A cautious archaeologist checks twice before labelling a find.',
      'Took your time with the magnifying glass. Nothing wrong with that.',
    ],
  },
  reveal: [
    "Let's check the field guide.",
    'What was the specimen?',
    "Here's what you examined.",
    "Let's mark the slates.",
  ],
  verdict: {
    right: [
      'Full marks! Worthy of a Digsite pendant.',
      'Exactly right! You clearly examine every rock and barrel you pass.',
      'Correct! I shall stamp your Earth Sciences certificate myself.',
      'Flawless identification. Curator Haig Halen will be delighted.',
    ],
    partial: [
      'Partial credit. You had the right era, at least.',
      'Close, though your field notes are a little smudged.',
      'Half marks. Enough to pass Level 1, if I am feeling generous.',
    ],
    wrong: [
      'Incorrect! Did you clean that specimen with a bronze pickaxe?',
      'No marks! Go back to panning for uncut jade at the river.',
      'Wrong, I am afraid. That would blow up the whole excavation.',
      'Not even close. Back to the student textbooks with you.',
    ],
    missed: [
      'A blank slate? Staring at the dirt will not pass the Digsite exam.',
      'Nothing written down! Did a workman steal your specimen brush?',
      'Time is up, and your field journal is still empty.',
    ],
  },
  // The examine line alone; the host asks what it belongs to.
  stem: 'examine',
}

export const hints: FieldHints = {
  prompt: 'It wasn’t a rock... it was a rock lobster!',
  explanation: '',
}

export const sample: Sample = {
  mode: 'guess_examine',
  type: 'multiple_choice',
  view: {
    prompt: 'A razor-sharp ring of obsidian.',
    options: ['Toktz-xil-ak', 'Toktz-xil-ul', 'Tzhaar-ket-om', 'Obsidian cape'],
  },
  answer: 1,
}

export const card: SuggestCard = { place: 2 }
