import type { SuggestCard, UpcomingMode } from '../modes'
import type { FieldHints } from '../placeholders'

export const upcoming: UpcomingMode = {
  id: 'prop_hunt',
  label: 'Prop Hunt',
  hint: 'Something in this screenshot is not what it seems. Tap it.',
  host: 'leela',
}

export const hints: FieldHints = {
  prompt: 'Which of these is a player in disguise?',
  explanation: 'The second bush from the left has no shadow.',
}

export const card: SuggestCard = {
  place: 18,
  hint: 'Your own screenshot, with something hidden for players to tap.',
  prompt: 'Which of these is a player in disguise?',
}
