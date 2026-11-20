import type { Mode } from '../modes'
import type { Sample } from '../samples'

export const mode: Mode = {
  id: 'more_less',
  label: 'More or Less',
  hint: 'A mix of Grand Exchange, High Alchemy and NPC prices.',
  host: { id: 'ali_morrisane', name: 'Ali Morrisane' },
  greeting: 'Ah, my friend! Step closer, step closer, and see what I have on my stall today.',
  blurb:
    'Two fine wares, one simple question: which is worth more, or less? My prices are always honest. Mostly.',
  ask: [
    'Look closely, my friend. My prices never lie!',
    'Two fine wares from Al Kharid. Which is it?',
    'Come, compare! I hide nothing from a customer.',
    'A shrewd trader like you can spot the bargain.',
    'Tell me, my friend, where does the smart money go?',
  ],
  waiting: [
    'Take your time. While we wait, do you need any bulk runes?',
    'No rush! Can I interest you in a slightly used flying carpet?',
    "A good haggle takes patience. My stall isn't going anywhere.",
    'The others are still counting their coins. Have a look at my crates.',
    'While they think, have you considered investing in Pollnivneach?',
  ],
  pace: {
    quick: [
      'Done in a heartbeat! You haggle like a Pollnivneach local.',
      'Quick as a desert wind! I love a decisive buyer.',
      'Sold! Before the ink on the price tag even dried.',
      'You know the street price by heart, I can tell!',
    ],
    middling: [
      'You weighed the merchandise carefully. I respect that.',
      'A sensible trader checks the goods for cracks first.',
      'Unrushed, unbothered. That is how fortunes are made.',
      'Bid placed! Now we wait on the window shoppers.',
    ],
    late: [
      'Just in time, my friend! I was already packing the crates.',
      'Got your bid in right before the camels left!',
      'Close call! Another second and I would have sold it to Traiborn.',
      'In at the last moment to close the deal!',
    ],
    early: [
      'Bought sight unseen! I admire your nerve, my friend.',
      'An early bid! Either you know your market or you like a gamble.',
      'You barely glanced at the wares! My kind of customer.',
      'Snapped up before the rest of the bazaar even looked!',
    ],
    later: [
      'Checked the hallmark, bit the coin, weighed it twice. Smart.',
      'You drive a careful bargain, my friend.',
      'Never buy a camel without checking its teeth first.',
      'A cautious buyer! Hard to swindle someone like you.',
    ],
  },
  reveal: [
    "Let's check the ledger!",
    "The scales don't lie.",
    'What says the market?',
    'Count the coins, my friend!',
  ],
  verdict: {
    right: [
      'A shrewd eye! Have you ever thought of opening a stall?',
      "Sharp eye, my friend! I couldn't swindle you if I tried.",
      'Right on the coin! You should come work for me in Pollnivneach.',
      'Pure profit! You know the value of everything in Gielinor.',
    ],
    partial: [
      'Close enough to break even, my friend!',
      'Half a profit is better than a kick from a camel.',
      'Not bad! Call it mate’s rates.',
      'Almost on the coin. You still walk away with a deal.',
    ],
    wrong: [
      'Ooh, painful! You just paid Al Kharid toll-gate prices.',
      'Wrong, my friend! Never mind, want to buy a magic carpet instead?',
      "Ah, you've been fleeced! Even my nephew prices better than that.",
      'No, no! My coin purse weeps for you.',
    ],
    missed: [
      "No bid at all? I can't haggle with silence, my friend!",
      'You stood there window-shopping until the bazaar closed!',
      'Not a single coin offered? That is no way to do business.',
      'The deal walked right past you while you were daydreaming!',
    ],
  },
  // Which of the two costs more, on the scroll; the names are the buttons below it.
  stem: 'more_less',
}

export const sample: Sample = {
  mode: 'more_less',
  type: 'more_less',
  view: {
    metric: 'high_alch',
    direction: 'more',
    options: [
      { subject: { name: 'Rune scimitar', asset: 'item:1333' } },
      { subject: { name: 'Rune platebody', asset: 'item:1127' } },
    ],
    as_of: '2026-10-01',
  },
  answer: 1,
  values: [15360, 39000],
}
