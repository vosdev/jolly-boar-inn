/** Free of imports, so the build can read it for the page's crawlable copy (`seo.ts`). */

export type WayId = 'free' | 'teams' | 'sofa'

/** How to play's three ways to play; `drawing` is the scene's words for a screen reader. */
export const WAYS_TO_PLAY: readonly { id: WayId; title: string; text: string; drawing: string }[] =
  [
    {
      id: 'free',
      title: 'Free for all',
      text: 'Everyone plays on their own computer or phone and scores points for themselves. Faster correct answers score more. Up to 50 players.',
      drawing: 'A laptop showing a question, with a pet in front of it scoring 820 points.',
    },
    {
      id: 'teams',
      title: 'Team against team',
      text: "Join a god's team in the lobby. Speed is less important than in free-for-all games, and your team scores the average of its members' points. Up to 6 teams and 50 players in total.",
      drawing: 'Saradomin and Zamorak side by side, three pets on each, with their team scores.',
    },
    {
      id: 'sofa',
      title: 'On the sofa',
      text: "Join from a big screen and make it the room's TV in the lobby. The TV shows the questions while everyone answers on their phones. Works for both free-for-all and teams, for up to 50 players (or as many as your sofa fits).",
      drawing: 'A TV showing a question, with four pets on a sofa below it, each holding a phone.',
    },
  ]
