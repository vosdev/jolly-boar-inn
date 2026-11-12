import { HOUSE } from '../house'
import type { Mode } from '../modes'

// Never offered as a round: the host's questions are random events inside other rounds.
// It is here for the stem those questions are drawn with, and for the splash of a room
// created when custom questions were a round of their own, and still plays them as one.
export const mode: Mode = {
  id: 'custom',
  label: "Host's Questions",
  hint: 'Questions the host wrote for this room.',
  host: HOUSE,
  greeting: 'Pull up a stool. Your room’s host scribbled a few questions of their own.',
  blurb:
    'Your host wrote these ones on the back of a beer mat. Whatever they ask, give it your best shot.',
  ask: [
    'Your host wrote this one. Have a go!',
    'A house special, straight from your host.',
    "Fresh off the back of your host's beer mat.",
    'Let’s see what your host cooked up for the table.',
  ],
  waiting: [
    'Your host is grinning behind their mug while the others think.',
    "I'll wipe down the bar while the rest of the table finishes.",
    "The table's still thinking. Another round of ales?",
  ],
  pace: {
    quick: [
      'Quick! Faster than it took your host to write it.',
      'Straight in! Your host didn’t stump you for a second.',
      'Fast work! Have a sip while the others scratch their heads.',
    ],
    middling: [
      'Answered at a comfortable pub pace.',
      'Locked in! Let’s see how the rest of the table handles it.',
      'In good time. The others are still squinting at it.',
    ],
    late: [
      'Just in time! Your host was already reaching for the bell.',
      'Got that in just in time, right before last orders!',
      'Slid across the table just in time!',
    ],
    early: [
      'Called it before the ink on the scroll even dried!',
      'Early! You clearly know how your host’s mind works.',
      'Instant answer! Did you peek over your host’s shoulder?',
    ],
    later: [
      'Had to read your host’s handwriting twice? Can’t blame you.',
      'Took a long hard look at that one. Tricky host!',
      'Left it late, but at least you got an answer on the coaster.',
    ],
  },
  reveal: ['What did your host write?', 'Drinks on the winner!', 'The house reveals:'],
  verdict: {
    right: [
      'Spot on! Your host owes you a pint for that one.',
      "Nailed it! Even a custom question couldn't trip you up.",
      'Dead right! You know your host’s tricks.',
    ],
    partial: [
      'Close enough for pub rules!',
      'Half marks. Your host will have to allow it.',
      'Nearly there! Worth half a pint, at least.',
    ],
    wrong: [
      'Ooh, walked right into your host’s trap!',
      'Wrong! You’re buying your host the next round.',
      'Not what was on the beer mat, I’m afraid!',
    ],
    missed: [
      'Stumped by your own host! Your ale’s gone flat.',
      'Nothing at all? Your host spent ages writing that one!',
      'Left your coaster blank while the clock ran out.',
    ],
  },
  // Every type a host can write asks in a sentence; the view below it is the answer.
  stem: 'text',
}
