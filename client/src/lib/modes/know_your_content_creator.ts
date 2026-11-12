import type { Mode } from '../modes'
import type { FieldHints } from '../placeholders'
import type { Sample } from '../samples'

export const mode: Mode = {
  id: 'know_your_content_creator',
  label: 'Know Your Content Creator',
  hint: 'Are you sure you are a fan?',
  host: { id: 'gnome_child', name: 'Gnome child' },
  greeting: 'Do you ever think about what it means to watch someone else click trees?',
  blurb:
    'Streamers say things, and things are said about streamers. Close the second monitor and show me what you know.',
  ask: [
    'But do you really know them?',
    'Is a streamer real if nobody is in chat?',
    'Think about it. Then think about it again.',
    'Somewhere out there, a hardcore just died.',
    'Have you ever noticed the green pixel?',
  ],
  waiting: [
    'Time is a construct. So is waiting for the rest of the room.',
    'Do the others think, or do they only guess?',
    'I have stood in the Gnome Stronghold forever. A few seconds is fine.',
    'Waiting is just watching a stream while the streamer is AFK.',
    'Every 0.6 seconds, another tick passes us all by.',
  ],
  pace: {
    quick: [
      'One-ticked it. Did you even stop to think?',
      'So fast. Your second monitor never leaves Twitch, does it?',
      'You answered before the game tick even finished.',
      'Quick. Some people just live in the chat.',
    ],
    middling: [
      'Not fast, not slow. Perfectly balanced, like a gnomeball pass.',
      'An answer at the speed of a four-tick whip.',
      'You took exactly as many ticks as you needed.',
    ],
    late: [
      'Just in time. Or was time just in you?',
      'Got it in just in time, on the very last tick.',
      'Just in time. Does the timer bar even exist?',
    ],
    early: [
      'You answered before you even read it. Interesting.',
      'Early. Do you see the future, or just the clips?',
      'So soon. Perhaps you were there live.',
    ],
    later: [
      'You waited to see more. So do we all.',
      'Later is just now, but a few ticks further away.',
      'You took your time. No XP waste here.',
    ],
  },
  reveal: [
    'Now you know. Or always knew.',
    'The truth was always there.',
    'Clip it and ship it.',
    'Was it ever in doubt?',
  ],
  verdict: {
    right: [
      'You knew. Perhaps you always knew.',
      'Correct. Nice.',
      'Right. You were definitely in the chat when it happened.',
      'True. The birthday boy would be proud.',
    ],
    partial: [
      'Partly right. 50/50: either you know it or you do not.',
      'Some of it was true. Like most clips on Reddit.',
      'Half right. Close enough for the highlight reel.',
    ],
    wrong: [
      'Wrong. Back to Lumbridge, hcim btw.',
      '73. Wait, no. Zero points.',
      'That was not it. Perhaps touch some Gnome Stronghold grass.',
      'Wrong. Clip that.',
    ],
    missed: [
      'You said nothing. AFK at the crab again?',
      'Silence is also an answer. Just worth zero points.',
      'No answer. You logged out mid-question.',
    ],
  },
  // Quotes and plain trivia share the round; the stem tells them apart by `quote`.
  stem: 'quote',
}

export const hints: FieldHints = {
  prompt: 'In Deadman Mansions, who captained TeamLUL?',
  explanation: 'Faux. B0aty captained TeamCBS, and Torvesta and Sick Nerd played under Faux.',
}

export const sample: Sample = {
  mode: 'know_your_content_creator',
  type: 'multiple_choice',
  view: {
    prompt: 'Which game company makes Old School RuneScape?',
    options: ['Blizzard', 'Jagex', 'Valve', 'Bethesda'],
  },
  answer: 1,
}
