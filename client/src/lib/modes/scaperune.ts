import type { FormWording } from '../customQuestions'
import type { Mode, SuggestCard } from '../modes'
import type { FieldHints } from '../placeholders'
import type { Sample } from '../samples'

export const mode: Mode = {
  id: 'scaperune',
  label: 'ScapeRune',
  hint: 'Welcome to the opposite of Gielinor.',
  host: { id: 'mr_mordaut', name: 'Mr. Mordaut' },
  greeting: 'Welcome to ScapeRune.',
  blurb:
    'Fish come cooked and go in the uncooking pot, and exams start with the answer. Find the question. Sit down.',
  // No splash in the Daily, so each of these has to say what to do on its own.
  ask: [
    'Here is the answer. What is the question?',
    'Which question goes with this answer?',
    'The answer comes first. Find its question.',
    'Read the answer on the board. Pick its question.',
    'An answer on the board: what is its question?',
  ],
  waiting: [
    'Eyes on your own desk. The rat finished ten seconds ago.',
    'Please refrain from eating your classmates while we wait.',
    'Silence in the classroom while the slower mammals finish reading.',
    'Do not poke the balloons until every paper is handed in.',
  ],
  pace: {
    quick: [
      'Handed in already? Even for a two-legged creature, that was brisk.',
      'Quick work. Did you actually read all four questions?',
      'First desk finished. You may sit with your arms folded.',
    ],
    middling: [
      'Submitted at an adequate pace. Remain in your seat.',
      'Paper received. Try not to fidget while the others finish.',
      'On time, as a properly trained pupil should be.',
    ],
    late: [
      'Slid onto my desk just in time! My claw was on the bell.',
      'Close call! One second later and it would be detention.',
      'Handed in at the bell. Stop chewing your quill.',
    ],
    early: [
      'Answered before the chalk dust settled on the board!',
      'Remarkably early. Have you been peeking at my lesson plan?',
      'Done on the first glance. Sit quietly.',
    ],
    later: [
      'Read all four questions twice, did you? Sensible.',
      'Slow, steady, and hopefully not backwards.',
      'Took the full exam period. At least you wrote something.',
    ],
  },
  reveal: [
    'Time. Quills down.',
    'Let us mark the slates.',
    'The matching question was:',
    'Eyes on the blackboard.',
  ],
  verdict: {
    right: [
      'Correct. You may pop a balloon on your way out.',
      'Full marks! A pupil with a functioning brain, at last.',
      'Right! Here is a Book of Knowledge for your trouble.',
      'Astonishing. You actually thought backwards properly.',
    ],
    partial: [
      'Half marks. Better than the goblin in the front row, I suppose.',
      'Partly right. Stay behind after class for remedial uncooking.',
      'Some credit, though your logic is muddled.',
    ],
    wrong: [
      "That's WRONG. Go stand in the corner with the Dunce.",
      'Incorrect! Is that what they teach you in regular Gielinor?',
      'No, no, no! Even Evil Bob’s servants score higher than that.',
      'Zero marks! Did you uncook your own brain before class?',
    ],
    missed: [
      'A completely blank slate. Detention.',
      'Nothing written at all? Even the frog wrote down a guess.',
      'Time expired while you stared at the blackboard. F.',
    ],
  },
  stem: 'board',
  stacked: true,
}

export const hints: FieldHints = {
  prompt: 'e.g. Zaff (or one entry per line for an ordered list)',
  explanation: 'Zaff sells battlestaves. Aubury has the runes and Lowe the bows.',
}

export const sample: Sample = {
  mode: 'scaperune',
  type: 'multiple_choice',
  view: {
    prompt: 'Lumbridge',
    options: [
      'Where do new players arrive after leaving Tutorial Island?',
      'Which city is home to the Grand Exchange?',
      'Which town is the Champions’ Guild just south of?',
      'Where in Asgarnia do the White Knights keep their castle?',
    ],
  },
  answer: 0,
}

export const wording: FormWording = {
  prompt: 'The answer shown on the board (one entry per line for an ordered list)',
  option: 'question',
}

export const card: SuggestCard = { place: 9 }
