import type { UpcomingMode } from '../modes'
import type { OrderingWording } from '../ordering'
import type { FieldHints } from '../placeholders'

export const upcoming: UpcomingMode = {
  id: 'release_order',
  label: 'Release Order',
  hint: 'Put quests and monsters in the order they came out.',
  host: 'aris',
}

export const hints: FieldHints = {
  prompt: 'Sort these updates by release date, from oldest to newest.',
  explanation: 'Dates come from the OSRS Wiki’s update history.',
}

export const ordering: OrderingWording = {
  prompt: 'What are they put in order of?',
  ends: ['Oldest', 'Newest'],
  detail: 'The date it came out, such as 4 January 2001',
  detailRequired: true,
}

export const orderingHint = 'Something worth putting in release order.'
