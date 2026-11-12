import type { Mode } from '../modes'
import type { FieldHints } from '../placeholders'
import type { Sample } from '../samples'

export const mode: Mode = {
  id: 'slayer_master',
  label: 'Slayer Master',
  hint: 'A real slayer master knows the weaknesses, tasks, and the best way to bring down the monsters.',
  host: { id: 'konar_quo_maten', name: 'Konar quo Maten' },
  greeting: 'I need your help. There is balance to be brought.',
  blurb:
    'Every monster has a weakness, a Slayer level, and a lair where it belongs. Prove you know your quarry, adventurer.',
  ask: [
    'How do you bring this creature down, adventurer?',
    'A true slayer knows their quarry. Answer me this.',
    'Check your gear and task list: what is the answer?',
    'Before you descend into the dungeon, tell me this.',
    'What does a seasoned slayer make of this task?',
  ],
  waiting: [
    'Mount Karuulm has stood for millennia; we can wait for the others.',
    'Check that you brought your rock hammer while the others think.',
    'The others are still gearing up at the bank.',
    'Patience, slayer. Rushing into a lair unprepared is how slayers die.',
  ],
  pace: {
    quick: [
      'Swift and decisive! You knew that monster’s weakness at a glance.',
      'Clean strike! You did not waste a single combat tick.',
      'Fast work, adventurer. Worthy of a Brimstone key drop.',
      'Instant answer! You have clearly reached 99 Slayer.',
    ],
    middling: [
      'A measured strike. You checked the dungeon before charging in.',
      'Steady and prepared. Your gear tab is clearly in order.',
      'Answered with discipline. Let us wait for the rest of your party.',
    ],
    late: [
      'Struck the finishing blow just in time!',
      'Activated Protect from Melee just in time, adventurer!',
      'Got your answer in just in time before the dragonfire landed!',
    ],
    early: [
      'You knew the task before I even named the dungeon!',
      'Geared and ready on the first word. Impressive, slayer.',
      'Instant call! You did not even need to check the Slayer gem.',
    ],
    later: [
      'Took a moment to check whether you needed nosepeg or earmuffs. Wise.',
      'Better to double-check your gear at the bank than walk back.',
      'Deliberate and cautious. You will survive the Catacombs that way.',
    ],
  },
  reveal: [
    'Here is how the task is done.',
    'The Slayer codex says:',
    'Know your quarry:',
    'Open the Brimstone chest:',
  ],
  verdict: {
    right: [
      'Well struck, adventurer. Take a Brimstone key for your trouble.',
      'Flawless knowledge. Even Duradel would respect that answer.',
      'Correct! Your task is complete, and your streak grows stronger.',
      'Spot on. You know every weakness in the Slayer codex.',
    ],
    partial: [
      'You survived the task, though you brought the wrong combat style.',
      'Close, adventurer. You got the monster right, if not the detail.',
      'Partial credit. Next time, check your Slayer ring before you go.',
    ],
    wrong: [
      'You walked into dust devils without a facemask! Back to Lumbridge.',
      'Wrong! Did you try fighting gargoyles without a rock hammer?',
      'Incorrect, adventurer. You are fighting them in the wrong dungeon!',
      'No! Even Vannaka’s novices know better than to try that.',
    ],
    missed: [
      'You stood at the dungeon entrance and never drew your weapon!',
      'No answer, adventurer? Your slayer task remains unfinished.',
      'Hesitation in a slayer cave is fatal. Speak up next time.',
    ],
  },
  stem: 'text',
}

export const hints: FieldHints = {
  prompt: 'Which item do you need to kill a rockslug?',
  explanation: 'Rockslugs need a bag of salt to finish them off at low HP.',
}

export const sample: Sample = {
  mode: 'slayer_master',
  type: 'multiple_choice',
  view: {
    prompt: 'Which item do you need to kill a rockslug?',
    options: ['Ice cooler', 'Bag of salt', 'Rock hammer', 'Fungicide spray'],
  },
  answer: 1,
}
