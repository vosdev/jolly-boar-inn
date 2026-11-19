import type { Mode, SuggestCard } from '../modes'
import type { FieldHints } from '../placeholders'
import type { Sample } from '../samples'

export const mode: Mode = {
  id: 'riddles_of_the_sphinx',
  label: 'Riddles of the Sphinx',
  hint: 'Five clues, vaguest first. How few do you need?',
  host: { id: 'sphinx', name: 'Sphinx' },
  greeting: 'Welcome to Sophanem, traveller. Answer my riddles, if you can.',
  blurb:
    'I describe someone or something of Gielinor in five clues. Pick the answer from the list; the sooner you answer, the more points you earn.',
  ask: [
    'Hear my riddle, traveller. What do I describe?',
    'Who or what am I? Listen closely.',
    'A new riddle from the sands. Name me.',
    'Think carefully. Who or what am I?',
    'The desert keeps many secrets. Here is one.',
  ],
  waiting: [
    'The sands shift while the others ponder.',
    'Patience. Not every mind is as quick as yours.',
    'I have waited a thousand years. I can wait a little longer.',
    'Let the others hear a few more clues.',
  ],
  pace: {
    quick: [
      'Answered on the first clue! A sharp mind indeed.',
      'You barely let me speak. Impressive.',
      'Faster than a desert wind!',
      'One clue was all you needed.',
    ],
    middling: [
      'A few clues in. A sensible pace.',
      'You listened before you spoke. Wise.',
      'Neither rash nor slow. Well paced.',
    ],
    late: [
      'Just in time! You waited for every clue.',
      'The punchline gave it away just in time.',
      'Just in time, before the sands ran out.',
    ],
    early: [
      'So soon? Bold, traveller.',
      'Answered on the first clue. Brave, or reckless?',
      'You did not wait for a second clue.',
    ],
    later: [
      'You heard every clue first. A careful mind.',
      'Every clue, then an answer. Better sure than sorry.',
      'You took your time. The riddle was long, after all.',
    ],
  },
  reveal: [
    "Behold my riddle's answer:",
    'The sands reveal the truth:',
    'This is what I described:',
    'The riddle is solved:',
  ],
  verdict: {
    right: [
      'Correct. Few mortals read me so well.',
      'You have solved my riddle. Well done.',
      'Right! Icthlarin would be proud.',
      'Just so. Your mind is as sharp as my claws.',
    ],
    partial: [
      'Close, but not quite the answer I hid.',
      'Nearly, traveller. Nearly.',
      'Almost. The sands nearly gave it to you.',
    ],
    wrong: [
      'Wrong. The desert has swallowed wiser guessers than you.',
      'No, that is not what I described.',
      'A poor guess. Listen more closely next time.',
      'Not even close. Perhaps the next riddle.',
    ],
    missed: [
      'No answer? Even silence is a guess, and a poor one.',
      'You said nothing. The riddle stays unsolved.',
      'Not a word? The sands are not impressed.',
    ],
  },
  stem: 'clues',
}

export const hints: FieldHints = {
  prompt: '',
  explanation: '',
}

export const sample: Sample = {
  mode: 'riddles_of_the_sphinx',
  type: 'pick_from_list',
  view: {
    prompt: 'Who or what am I?',
    vocab: 'subjects',
    clues: [
      'I have travelled further than most adventurers.',
      'I was not always the shape I am now.',
      'You will find me wandering towns, never the same one for long.',
      'A certain amulet lets you hear what I have to say.',
      'Meow.',
    ],
  },
  answer: 6,
  subject: { name: 'Bob (cat)' },
}

export const card: SuggestCard = {
  place: 19,
  hint: 'Five clues, vaguest first, for the Sphinx to ask.',
}
