


# New UI design ideas


Every game mode is hosted by an NPC.

For example, A Grand Exchange clerk will host The Price Is Right.
The Gnome Child will host the Clipped (That I want to rename to Know Your Concent Creator!)

We can change the game modes accordingly in the Create screen, something like Grand Exchange presents: The Price Is Right!

We would have to find fitting NPCs to host each of the game modes that we have.

When a game round starts, the NPC will first introduce it. (Current splash screen).

When this happens, I imagine the NPC standing on the left of the screen. This would be either just their head, or their upperbody + head.

Then in the middle of the screen, where the question is displayed, we can have the paper of a Clue Scroll displayed. We have to make our own SVG, and perhaps stretch it out a bit. I think 20% of the width is for the NPC and 80% for the clue scroll. We also have to make our own SVGs for each of the NPCs.

On this clue scroll we can have the round introduction. Telling you how this game mode works.

We have to modify every text to make it as if the NPC is presenting it. To make it feel more OSRS-like.

This can be combined with random events.

When a random event pops up. The NPC and Clue Scroll can move to the left. The NPC can fade out. The Random Event NPC fades in, the question of the Random Event fades in (as if it were being typed really fast). And 2 seconds later, the buttons/inputs for this random event pop up.

The random event is then answered/scored.

The Random Event NPC leaves via the same way. Clue scroll moves a bit to the right again, random event npc fades out. Game mode NPC fades in, game mode buttons appear again and the game mode can continue.

Working on the random events I came up with so many fun themed questions that I want these random events to play a bigger role in the trivia game.

So instead of the ability to disable random events (In the feature that isn't built yet), I want the ability to configure their frequency. Less often, default and more often.

We have to think of a balanced amount of random events. By default I'm thinking 1 in every 10 questions. Less often can be 1 in every 20, more often can be 1 in every 5 or 7 questions.

This can be configured at room creation. When a player only enables 1 game mode with 10 questions, it will say a total of 11 questions.


Here is a rough drawing:
```
[                  topbar           ]

      *----------------------------*
      |                            |
      |        Welcome to...       |
  /\  |     The Price is Right!    |
  \/  |                            |
/-||-\|   One item, four prices.   |
|    ||  Can you guess which is right?|
      *----------------------------*

_____________________________________
            <ready checkmarks>

```


```
[                  topbar           ]

      *----------------------------*
      |                            |
      |                            |
  /\  | Which is worth MORE through HA?|
  \/  |                            |
/-||-\|                            |
|    ||                            |
      *----------------------------*

_____________________________________
      <option A> <option B>

```
