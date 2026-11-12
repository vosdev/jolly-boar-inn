import type { Mode } from '../modes'
import type { Sample } from '../samples'

export const mode: Mode = {
  id: 'price_is_right',
  label: 'The Price is Right',
  hint: 'Test your Grand Exchange knowledge.',
  host: { id: 'grand_exchange_clerk', name: 'Grand Exchange Clerk' },
  greeting: 'Welcome to the Grand Exchange. Step up to the booth whenever you are ready.',
  blurb:
    'One item and a slider of prices. Slide to what it really trades for on the Grand Exchange - no +5% button to save you here.',
  ask: [
    'What does this item go for on the Grand Exchange?',
    'What would this item fetch on the Grand Exchange?',
    'Name the Grand Exchange guide price for this item.',
    'What does this trade for on the Grand Exchange?',
    'How much is this worth on the Grand Exchange?',
  ],
  waiting: [
    'Your offer is in the slot. Waiting on the rest of the floor.',
    'Hold on, someone at the west booth is still counting their gp.',
    'Offer logged. Feel free to bank-stand while the others finish.',
    'Still matching offers across the market. Won’t be a moment.',
    'Waiting on the other traders. Please do not spam-click the booth.',
  ],
  pace: {
    quick: [
      'Instabought! You did not even haggle over a single coin.',
      'Offer placed in a single tick. Flippers hate you.',
      'Faster than a merch clan dumping their stock!',
      'Straight in! You must flip these every day.',
    ],
    middling: [
      'Offer placed at guide price. Steady and sensible.',
      'Logged and queued. No need to mash the +5% button.',
      'A calm trade. Now we wait for the rest of the floor.',
      'Offer in! Let us see if the market meets your price.',
    ],
    late: [
      'Offer placed just in time, right before the daily price update!',
      'Slid across the counter just in time! The booth was closing.',
      'Got that offer in just in time, nearly hit the four-hour limit.',
      'Just in time! The clerk was already locking the till.',
    ],
    early: [
      'First offer in the book! Setting the market price yourself?',
      'An early bid, before the price checkers even loaded.',
      'Straight into the offer slot! You know your street prices.',
    ],
    later: [
      'Double-checked the margin before hitting confirm. Smart.',
      'Took a moment to count the zeroes. Better than selling for 1 gp!',
      'Careful with the slider. Nobody wants a misplaced decimal.',
    ],
  },
  reveal: [
    'Your offer has completed.',
    'Let us check the guide price.',
    'Collect your items and coins.',
    'Here is what it goes for.',
  ],
  verdict: {
    right: [
      'Green bar! Your offer filled to the very last coin.',
      'Spot on the guide price. You could run a booth yourself.',
      'Matched the market to a tee. Pleasure doing business with you.',
      'Exact price! Not a single coin wasted on the margin.',
    ],
    partial: [
      'Close enough to fill! You only overpaid by a few percent.',
      'Your offer partially completed. Respectable eye for the market.',
      'Right ballpark! A flipper would happily take that margin.',
      'Near the guide price. You will not go broke trading like that.',
    ],
    wrong: [
      'That offer is going to sit in your slot for six months.',
      'Way off market price. Did you miss a zero on the slider?',
      'Offer rejected! Not even a desperate quester would pay that.',
      'Ouch. Whoever traded with you just made a fortune.',
    ],
    missed: [
      'You left your offer slot completely empty!',
      'Too busy bank-standing at the booth to place a bid?',
      'No offer submitted. The market waits for no one!',
      'Did you hit the four-hour buy limit, or just forget to bid?',
    ],
  },
  // The item and its picture, above a slider; what to do with them is the host's to say.
  stem: 'price',
}

export const sample: Sample = {
  mode: 'price_is_right',
  type: 'price_is_right',
  view: {
    subject: { name: 'Dragon boots', asset: 'item:11840' },
    min: 70000,
    max: 150000,
    as_of: '2026-10-28',
  },
  value: 130000,
}
