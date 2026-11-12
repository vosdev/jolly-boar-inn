import type { Mode } from '../modes'
import type { FieldHints } from '../placeholders'
import type { Sample } from '../samples'

export const mode: Mode = {
  id: 'drop_table',
  label: 'Drop Table',
  hint: 'Ironmen should know this.',
  host: { id: 'nieve', name: 'Nieve' },
  greeting: 'Got a task for you. Not a task to kill, but a question to solve.',
  blurb:
    'Your task: know the loot. Who drops it, what they drop, and at what rate they drop it. Show me what you know.',
  ask: [
    'Next on your task: how well do you know this drop?',
    'Every ironman has wiki-searched this one at 2 a.m.',
    'Load your cannon. What do you make of this?',
    'Do you check the loot beam, or alch everything?',
    'You’ve killed plenty of these. What’s the drop?',
  ],
  waiting: [
    'Waiting on your party. Reload your cannon while they think.',
    'Take your time. I’ve gone three thousand kills dry waiting on worse.',
    'Still waiting on the others. Did someone forget a Ring of Wealth?',
    'Sip a prayer potion while the rest of the room finishes up.',
    'Good loot takes patience. Unless you get spooned on kill count one.',
  ],
  pace: {
    quick: [
      'Spooned on the first kill! You knew that drop rate by heart.',
      'Fast! You’ve definitely camped that monster for a week straight.',
      'One-tick flicked that answer! Clean work.',
      'Instant answer, spoken like someone who’s gone dry for it.',
    ],
    middling: [
      'Solid pace, like a steady task in the Stronghold cave.',
      'Locked in! Now we wait to see what drops.',
      'Nice and steady, no prayer points wasted.',
      'Answer’s in. Let’s see if the RNG gods are smiling on you.',
    ],
    late: [
      'Got that in just in time - nearly ran out of prayer at 1 HP!',
      'Clicked your emergency teleport tab just in time!',
      'Just in time! One tick later and you’d be waking up in Lumbridge.',
      'Ate an anglerfish just in time to survive the hit!',
    ],
    early: [
      'Called the drop before the monster even hit the floor!',
      'Instant call! You’ve spent way too long staring at drop tables.',
      'Barely saw the loot beam and you already knew it!',
    ],
    later: [
      'Had to mentally calculate the 1-in-512 first? Fair enough.',
      'Checked the floor twice to make sure you didn’t miss a rare drop.',
      'Slow kill, but as long as the loot’s on the ground, it counts.',
    ],
  },
  reveal: [
    'Check the loot pile!',
    'What’s under the loot beam?',
    'Let’s see the drop table.',
    'Here’s what dropped.',
  ],
  verdict: {
    right: [
      'Collection log slot: completed! Nice work.',
      'Pink loot beam! You know your drop tables inside out.',
      'Spot on! Thirty slayer points and a pat on the back.',
      'Clean kill, clean answer. Steve couldn’t have done it better.',
    ],
    partial: [
      'Close! Call it rare drop table: uncut sapphire for your trouble.',
      'Half credit. Like getting a dragon med helm instead of the visage.',
      'Not quite the unique, but decent alchables at least.',
    ],
    wrong: [
      'Oof, nothing but ashes and a troll roll of 32 pure essence.',
      'Wrong! Go see Turael and reset your streak.',
      'Missed! Did you forget to wear your slayer helmet?',
      'Zero points. Enjoy your task of 180 bronze dragons.',
    ],
    missed: [
      'AFK with auto-retaliate off? The despawn timer ate your loot!',
      'You stood there watching your purple drop disappear on the floor!',
      'No answer at all. Did you DC mid-task?',
    ],
  },
  // The prompt still names the item or the monster: a question whose picture is
  // missing has to read without it.
  stem: 'text',
}

export const hints: FieldHints = {
  prompt: 'Which boss drops a Jar of miasma?',
  explanation: 'Dropped by the Abyssal Sire via the Unsired.',
}

export const sample: Sample = {
  mode: 'drop_table',
  type: 'multiple_choice',
  view: {
    prompt: 'Which monster drops the Abyssal whip?',
    options: ['Greater demon', 'Abyssal demon', 'Black dragon', 'Gargoyle'],
  },
  answer: 1,
}
