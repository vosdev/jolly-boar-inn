import type { Mode } from '../modes'
import type { FieldHints } from '../placeholders'
import type { Sample } from '../samples'

// Only on a server that switched it on, for testing the NPCs' questions in a row.
export const mode: Mode = {
  id: 'tales_of_gielinor',
  label: 'Tales of Gielinor',
  hint: 'Quests, lore and the tales of Gielinor.',
  host: { id: 'wise_old_man', name: 'Wise Old Man' },
  greeting: 'Pull up a chair by the bookshelf. I have stories older than Draynor Village.',
  blurb:
    "I have walked every road in Gielinor, fought Elvarg's kin and retired with a blue partyhat. Let's see how much of the lore you actually paid attention to.",
  ask: [
    'Tell me, do you remember how this tale goes?',
    'Here is one from my adventuring days.',
    'Did you read the quest dialogue, or hold spacebar?',
    'Now, where was I? Ah yes, answer me this.',
    'From the old chronicles: what do you make of this?',
  ],
  waiting: [
    'While we wait, would you like me to check your bank for junk?',
    'Still thinking? You lot take longer than Swan Song.',
    'Let me polish my spectacles while the rest of the table catches up.',
    'I have plenty of time. Though at my age, not *that* much time.',
  ],
  pace: {
    quick: [
      'Quick! Not even I cleared out Draynor Bank that fast.',
      'In a flash! A true Quest Point Cape wearer.',
      'Straight in! You didn’t even need to check the wiki guide.',
      'Sharp as a Saradomin strike! My knees wish they were that quick.',
    ],
    middling: [
      'A sensible walking pace. No need to burn your run energy.',
      'Answered in good time. Now let the youngsters catch up.',
      'Steady and sure, like an old campaigner.',
    ],
    late: [
      'Got that in just in time, before I nodded off in my rocking chair!',
      'Just in time! The curtain was nearly falling on the act.',
      'Squeezed your answer in just in time, like a last-second teleport!',
    ],
    early: [
      'Barely opened the scroll and you knew the lore!',
      'Youth! Always rushing ahead before the old man finishes speaking.',
      'Answered on the first line. You’ve done this quest before.',
    ],
    later: [
      'Had to dust off the back of your quest journal for that one, eh?',
      'Took a moment to recall the chapter. Wisdom is never rushed.',
      'Searched your memory carefully. I respect that.',
    ],
  },
  reveal: [
    'Here is how the tale goes.',
    'As written in the chronicles:',
    'I was there, you know.',
    'What says the quest journal?',
  ],
  verdict: {
    right: [
      'Well remembered! Worthy of the blue partyhat on my head.',
      'Spot on! You actually read the dialogue instead of holding spacebar.',
      'Correct! Two quest points and a bowl of monkfish stew for you.',
      'Exactly right! Dionysius himself is impressed.',
    ],
    partial: [
      'Close! You remembered the boss fight, even if you skimmed the plot.',
      'Half the tale right. The bards embellish the rest anyway.',
      'Nearly there! Old memories get a little fuzzy for me, too.',
    ],
    wrong: [
      'Rubbish! That is what happens when you spacebar through quests.',
      'Wrong! Even a Lumbridge goblin knows that bit of history.',
      'No, no. You have muddled up the Fourth Age with a pub rumour.',
      'Incorrect! Go talk to Reldo and read a book or two.',
    ],
    missed: [
      'No answer? And here I thought I was the one who naps mid-tale.',
      'Nothing at all? Did a highwayman outside Draynor rob your wits?',
      'You stood there in silence like a guard outside Varrock Palace.',
    ],
  },
  stem: 'text',
}

export const hints: FieldHints = {
  prompt: 'Who gives you the Lost City quest?',
  explanation: 'The Warrior camped in Lumbridge Swamp is searching for Zanaris.',
}

export const sample: Sample = {
  mode: 'tales_of_gielinor',
  type: 'multiple_choice',
  view: {
    prompt: 'Whose Edicts keep the gods from walking Gielinor?',
    options: ['Saradomin', 'Guthix', 'Zamorak', 'Armadyl'],
  },
  answer: 1,
}
